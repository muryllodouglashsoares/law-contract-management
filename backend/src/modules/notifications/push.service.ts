import type { PrismaClient } from '@prisma/client';

import { ConflictError } from '../../shared/errors';
import type {
  PushMessage,
  PushNotifier,
  PushRecipient,
  PushSendResult,
  WebPushSender,
} from './push.types';
import { PUSH_EVENT_TYPES } from './push.types';

type PushPrisma = { pushSubscription: PrismaClient['pushSubscription'] };

export interface PushLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

const consoleLogger: PushLogger = {
  // O endpoint de uma subscription é uma URL-capacidade (quem a conhece pode enviar push ao
  // dispositivo): nunca é logado; só ids internos e códigos de status.
  warn: (message, meta) => console.warn(`[push] ${message}`, meta ?? ''),
};

const GONE_STATUS_CODES = new Set([404, 410]);

/**
 * Serviços de push de navegador conhecidos. O backend faz um POST para o `endpoint` que o
 * cliente informou; sem esta lista, um usuário autenticado poderia apontá-lo para um host
 * interno (SSRF). Apenas https, sem credenciais/porta, e só estes domínios:
 *  - FCM (Chrome, Edge, Brave, Opera, Samsung): fcm.googleapis.com
 *  - Mozilla autopush (Firefox): *.push.services.mozilla.com
 *  - Apple (Safari): *.push.apple.com
 *  - Windows Notification Service (Edge legado): *.notify.windows.com
 */
const PUSH_SERVICE_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Só caminhos internos do app: impede que um payload leve o usuário para outro site. */
function safeInternalPath(url: string | undefined): string | undefined {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return undefined;
  return url;
}

export interface PushStatus {
  /** false = VAPID não configurado no servidor (Web Push desativado). */
  configured: boolean;
  /** Chave pública VAPID (a privada nunca sai do backend). */
  publicKey: string | null;
  /** Dispositivos do usuário com Web Push ativo. */
  subscriptionCount: number;
}

/**
 * Serviço central de Web Push: gerenciamento de subscriptions do usuário autenticado e envio.
 * `sender = null` significa Web Push desativado — todo envio vira no-op, então os módulos de
 * negócio não precisam checar configuração.
 */
export class PushService implements PushNotifier {
  constructor(
    private readonly prisma: PushPrisma,
    private readonly sender: WebPushSender | null,
    private readonly publicKey: string | null,
    private readonly logger: PushLogger = consoleLogger,
  ) {}

  get configured(): boolean {
    return this.sender !== null;
  }

  // -------------------------------------------------------------------
  // Gerenciamento (sempre do usuário autenticado)
  // -------------------------------------------------------------------

  async status(actor: PushRecipient): Promise<PushStatus> {
    const subscriptionCount = await this.prisma.pushSubscription.count({
      where: { userId: actor.userId, officeId: actor.officeId },
    });
    return { configured: this.configured, publicKey: this.configured ? this.publicKey : null, subscriptionCount };
  }

  /**
   * Registra/atualiza a subscription deste navegador para o usuário autenticado. Idempotente
   * por `endpoint`. Se o mesmo navegador já estava ligado a outro usuário (computador
   * compartilhado), a subscription é transferida para quem está logado agora.
   */
  async subscribe(actor: PushRecipient, input: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    if (!this.configured) {
      throw new ConflictError('As notificações do navegador não estão configuradas no servidor.');
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { officeId: actor.officeId, userId: actor.userId, ...input },
      update: { officeId: actor.officeId, userId: actor.userId, p256dh: input.p256dh, auth: input.auth },
    });
  }

  /** Remove só a subscription do próprio usuário (idempotente: inexistente = nada a fazer). */
  async unsubscribe(actor: PushRecipient, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: actor.userId, officeId: actor.officeId },
    });
  }

  /** Push de teste: só para os próprios dispositivos do usuário autenticado. */
  async sendTest(actor: PushRecipient): Promise<PushSendResult> {
    if (!this.configured) {
      throw new ConflictError('As notificações do navegador não estão configuradas no servidor.');
    }
    return this.sendToUser(actor, {
      type: PUSH_EVENT_TYPES.TEST,
      title: 'Notificações ativadas',
      body: 'Este é um aviso de teste do LexContract.',
      url: '/notificacoes',
      tag: 'test',
    });
  }

  // -------------------------------------------------------------------
  // Envio (somente a partir de eventos do backend)
  // -------------------------------------------------------------------

  /** Envia a todos os dispositivos de um usuário ATIVO do escritório. Nunca lança. */
  async sendToUser(recipient: PushRecipient, message: PushMessage): Promise<PushSendResult> {
    return this.sendToUsers([recipient], message);
  }

  /**
   * Fan-out para vários usuários: deduplica por `officeId + userId` (um usuário que apareça por
   * mais de um motivo — ex.: responsável que também é ADMIN — recebe UMA vez por dispositivo),
   * busca as subscriptions de todos em uma consulta, envia a todos os dispositivos e remove as
   * inválidas (404/410). Só usuários ATIVOS, sempre casando o par officeId + userId. Nunca lança.
   */
  async sendToUsers(recipients: PushRecipient[], message: PushMessage): Promise<PushSendResult> {
    const result: PushSendResult = { sent: 0, removed: 0, failed: 0 };
    if (!this.sender) return result;

    try {
      const targets = dedupeRecipients(recipients);
      if (targets.length === 0) return result;

      const [only] = targets;
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: {
          ...(targets.length === 1 && only
            ? { userId: only.userId, officeId: only.officeId }
            : { OR: targets.map((target) => ({ userId: target.userId, officeId: target.officeId })) }),
          user: { status: 'ACTIVE' },
        },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      if (subscriptions.length === 0) return result;

      const payload = JSON.stringify({
        type: message.type,
        title: message.title,
        body: message.body,
        url: safeInternalPath(message.url),
        tag: message.tag,
      });

      const goneIds: string[] = [];
      const sender = this.sender;
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await sender.send(subscription, payload);
            result.sent += 1;
          } catch (error) {
            const statusCode = (error as { statusCode?: number } | null)?.statusCode;
            if (statusCode !== undefined && GONE_STATUS_CODES.has(statusCode)) {
              goneIds.push(subscription.id);
            } else {
              result.failed += 1;
              this.logger.warn('Falha ao enviar Web Push', { subscriptionId: subscription.id, statusCode });
            }
          }
        }),
      );

      if (goneIds.length > 0) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: { in: goneIds } } });
        result.removed = goneIds.length;
      }
    } catch (error) {
      this.logger.warn('Falha ao processar Web Push', { reason: error instanceof Error ? error.message : 'unknown' });
    }

    return result;
  }
}

/** Remove destinatários repetidos (mesmo officeId + userId), preservando a ordem. */
function dedupeRecipients(recipients: PushRecipient[]): PushRecipient[] {
  const seen = new Set<string>();
  const unique: PushRecipient[] = [];
  for (const recipient of recipients) {
    const key = `${recipient.officeId}:${recipient.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ officeId: recipient.officeId, userId: recipient.userId });
  }
  return unique;
}
