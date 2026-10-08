import type { PrismaClient, UserRole } from '@prisma/client';

import {
  type PushEventType,
  type PushMessage,
  type PushNotifier,
  type PushRecipient,
} from './push.types';

/**
 * POLÍTICA CENTRAL de destinatários do Web Push.
 *
 * Os módulos de negócio (assinatura, cron de renovação, ...) NÃO consultam usuários nem sabem
 * quem recebe cada aviso: eles chamam `notifyPushEvent(...)` informando o evento e o contexto
 * (escritório + responsável). Quem recebe é decidido SÓ aqui, em `PUSH_RECIPIENT_POLICY`.
 *
 * Regras fixas (valem para qualquer política):
 *  - só usuários ATIVOS e do MESMO escritório do evento;
 *  - usuários que desligaram o push (UserNotificationPreference.pushEnabled = false) não recebem;
 *  - deduplicação por usuário (um responsável que também é ADMIN recebe uma vez);
 *  - cada usuário recebe em todos os seus dispositivos (a entrega é do PushService);
 *  - ASSISTANT só recebe se a política listar explicitamente (ex.: regra `ROLE` com `ASSISTANT`
 *    ou `USERS` com o id dele).
 */

/** Uma regra de destinatário. A política de um evento é a UNIÃO das suas regras. */
export type PushRecipientRule =
  | { kind: 'RESPONSIBLE' } // responsável pelo contrato/evento
  | { kind: 'ROLE'; role: UserRole } // todos os usuários ativos do escritório com este papel
  | { kind: 'USERS'; userIds: readonly string[] }; // usuários específicos (sempre filtrados pelo escritório)

export const RULE_RESPONSIBLE: PushRecipientRule = { kind: 'RESPONSIBLE' };
export const RULE_ADMINS: PushRecipientRule = { kind: 'ROLE', role: 'ADMIN' };

/** Eventos cujos destinatários vêm da política. `TEST` não entra: é sempre só o próprio usuário. */
export type PolicyPushEvent = Exclude<PushEventType, 'TEST'>;

/**
 * Configuração atual (por código — não há tela de administração para isso, por enquanto).
 *
 * Exemplos para o futuro:
 *   somente o responsável:        [RULE_RESPONSIBLE]
 *   somente ADMINs:               [RULE_ADMINS]
 *   responsável + ADMINs:         [RULE_RESPONSIBLE, RULE_ADMINS]
 *   incluir assistentes:          [..., { kind: 'ROLE', role: 'ASSISTANT' }]
 *   usuários específicos:         [..., { kind: 'USERS', userIds: ['<uuid>'] }]
 */
export const PUSH_RECIPIENT_POLICY: Readonly<Record<PolicyPushEvent, readonly PushRecipientRule[]>> = {
  CONTRACT_SIGNED: [RULE_RESPONSIBLE, RULE_ADMINS],
  CONTRACT_RENEWAL: [RULE_RESPONSIBLE, RULE_ADMINS],
  // Alertas financeiros e de link de assinatura: o responsável pelo contrato. ADMINs NÃO entram por
  // padrão, para não gerar um push por parcela/link para todo o escritório (spam).
  PAYMENT_DUE_SOON: [RULE_RESPONSIBLE],
  PAYMENT_DUE_TODAY: [RULE_RESPONSIBLE],
  PAYMENT_OVERDUE: [RULE_RESPONSIBLE, RULE_ADMINS],
  SIGNATURE_NEVER_OPENED: [RULE_RESPONSIBLE],
  SIGNATURE_EXPIRING: [RULE_RESPONSIBLE],
  // Revisão interna: quem revisa recebe o pedido; quem enviou (passado como "responsável" do evento)
  // recebe a decisão.
  CONTRACT_REVIEW_SUBMITTED: [{ kind: 'ROLE', role: 'LAWYER' }, RULE_ADMINS],
  CONTRACT_APPROVED: [RULE_RESPONSIBLE],
  CONTRACT_REJECTED: [RULE_RESPONSIBLE],
};

/** Política parcial: eventos sem entrada não têm destinatários (útil em testes e políticas customizadas). */
export type PushRecipientPolicy = Readonly<Partial<Record<PolicyPushEvent, readonly PushRecipientRule[]>>>;

export interface PushEventContext {
  /** Escritório do evento: nenhum destinatário de outro escritório é aceito. */
  officeId: string;
  /** Responsável pelo contrato (alvo da regra `RESPONSIBLE`). */
  responsibleId: string | null;
}

type UserLookup = Pick<PrismaClient, 'user'>;

/**
 * Resolve os destinatários de um evento. Uma única consulta ao banco; o resultado é filtrado
 * de novo em memória (officeId + ACTIVE + regra) como defesa em profundidade, e deduplicado
 * por usuário, com o responsável primeiro.
 */
export async function resolvePushRecipients(
  prisma: UserLookup,
  event: PolicyPushEvent,
  context: PushEventContext,
  policy: PushRecipientPolicy = PUSH_RECIPIENT_POLICY,
): Promise<PushRecipient[]> {
  const rules = policy[event] ?? [];

  const responsibleId = rules.some((rule) => rule.kind === 'RESPONSIBLE') ? context.responsibleId : null;
  const roles = new Set<UserRole>();
  const explicitIds = new Set<string>();
  for (const rule of rules) {
    if (rule.kind === 'ROLE') roles.add(rule.role);
    if (rule.kind === 'USERS') rule.userIds.forEach((id) => explicitIds.add(id));
  }
  if (responsibleId) explicitIds.add(responsibleId);

  const or: ({ id: { in: string[] } } | { role: { in: UserRole[] } })[] = [];
  if (explicitIds.size > 0) or.push({ id: { in: [...explicitIds] } });
  if (roles.size > 0) or.push({ role: { in: [...roles] } });
  if (or.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { officeId: context.officeId, status: 'ACTIVE', OR: or },
    select: { id: true, officeId: true, status: true, role: true, notificationPreference: { select: { pushEnabled: true } } },
  });

  const eligible = users.filter(
    (user) =>
      user.officeId === context.officeId &&
      user.status === 'ACTIVE' &&
      // Preferência do usuário: pushEnabled = false silencia o Web Push (sem linha = ligado).
      user.notificationPreference?.pushEnabled !== false &&
      (explicitIds.has(user.id) || roles.has(user.role)),
  );

  // Deduplica por id; o responsável (se houver) vai primeiro.
  const byId = new Map<string, PushRecipient>();
  for (const user of eligible) {
    if (!byId.has(user.id)) byId.set(user.id, { officeId: context.officeId, userId: user.id });
  }
  const ordered = [...byId.values()];
  if (responsibleId) ordered.sort((a, b) => Number(b.userId === responsibleId) - Number(a.userId === responsibleId));
  return ordered;
}

export interface PushEventDeps {
  prisma: UserLookup;
  /** Sem notifier (Web Push não configurado) = no-op, sem nenhuma consulta ao banco. */
  push: PushNotifier | undefined;
  policy?: PushRecipientPolicy;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
}

const defaultWarn = (message: string, meta?: Record<string, unknown>) => console.warn(`[push] ${message}`, meta ?? '');

/**
 * Ponto único de uso dos módulos de negócio: resolve os destinatários pela política e envia.
 * NUNCA lança — falha ao resolver ou enviar push não pode quebrar o evento de negócio. Deve ser
 * chamado SOMENTE depois do commit da transação do evento.
 *
 * Se a consulta de destinatários falhar, o responsável (quando a política o inclui) ainda é
 * avisado: perder o aviso dos ADMINs é melhor do que perder todos.
 */
export async function notifyPushEvent(
  deps: PushEventDeps,
  event: PolicyPushEvent,
  context: PushEventContext,
  message: PushMessage,
): Promise<void> {
  const { push } = deps;
  if (!push) return;
  const warn = deps.warn ?? defaultWarn;
  const policy = deps.policy ?? PUSH_RECIPIENT_POLICY;

  let recipients: PushRecipient[];
  try {
    recipients = await resolvePushRecipients(deps.prisma, event, context, policy);
  } catch (error) {
    warn('Falha ao resolver destinatários do Web Push', { event, reason: error instanceof Error ? error.message : 'unknown' });
    const includesResponsible = (policy[event] ?? []).some((rule) => rule.kind === 'RESPONSIBLE');
    recipients =
      includesResponsible && context.responsibleId
        ? [{ officeId: context.officeId, userId: context.responsibleId }]
        : [];
  }

  if (recipients.length === 0) return;

  try {
    await push.sendToUsers(recipients, message);
  } catch (error) {
    warn('Falha ao enviar Web Push', { event, reason: error instanceof Error ? error.message : 'unknown' });
  }
}
