import type { Prisma, PrismaClient, SignatureLinkAlertType } from '@prisma/client';

import { AUDIT_ACTIONS, SYSTEM_ACTOR_LABEL, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { SIGNABLE_CONTRACT_STATUSES } from '../../shared/domain/status-map';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher';
import { PUSH_EVENT_TYPES } from '../notifications/push.types';

const HOUR_MS = 60 * 60 * 1000;
const BATCH_SIZE = 200;

export interface SignatureAlertsJobConfig {
  enabled: boolean;
  /** Link enviado e nunca aberto há mais de N horas. */
  neverOpenedHours: number;
  /** Link que expira em até N horas. */
  expiringHours: number;
}

export interface SignatureAlertsJobResult {
  processed: number;
  notified: number;
  skipped: number;
  enabled: boolean;
}

export function buildNeverOpenedDescription(contractNumber: number, hours: number): string {
  return `O link do contrato #${contractNumber} foi enviado há mais de ${hours} ${hours === 1 ? 'hora' : 'horas'}, mas ainda não foi aberto.`;
}

export function buildExpiringDescription(contractNumber: number, hours: number): string {
  return `O link do contrato #${contractNumber} expira em menos de ${hours} ${hours === 1 ? 'hora' : 'horas'}.`;
}

type PrismaDeps = Pick<PrismaClient, 'contractPublicSignature' | 'signatureLinkAlert' | 'notification' | 'auditLog' | '$transaction'>;

interface Candidate {
  id: string;
  officeId: string;
  contractVersionId: string;
  createdAt: Date;
  expiresAt: Date;
  firstOpenedAt: Date | null;
  contract: {
    id: string;
    number: number;
    status: string;
    responsibleId: string;
    versions: { id: string }[];
  };
}

/**
 * Job diário de alertas de link de assinatura (POST /internal/jobs/signature-link-alerts).
 *
 *  - SIGNATURE_NEVER_OPENED: link ativo, nunca aberto (firstOpenedAt nulo), criado há mais de N h.
 *  - SIGNATURE_EXPIRING: link ativo que expira em até N h (ignorado se a validade TOTAL do link já
 *    é menor ou igual a N h — seria "perto de expirar" desde o início).
 *
 * Nunca alerta link usado, revogado, expirado, ou de contrato que deixou de ser assinável / cuja
 * versão não é mais a atual. Idempotência no banco: UNIQUE (signatureId, type) com
 * ON CONFLICT DO NOTHING na mesma transação da Notification/AuditLog. Push/e-mail depois do commit.
 */
export class SignatureLinkAlertsJobService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly config: SignatureAlertsJobConfig,
    private readonly dispatcher?: NotificationDispatcher,
  ) {}

  async run(now: Date = new Date()): Promise<SignatureAlertsJobResult> {
    const result: SignatureAlertsJobResult = { processed: 0, notified: 0, skipped: 0, enabled: this.config.enabled };
    if (!this.config.enabled) return result;

    const baseWhere: Prisma.ContractPublicSignatureWhereInput = {
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      contract: { status: { in: SIGNABLE_CONTRACT_STATUSES } },
    };

    await this.scan(
      'SIGNATURE_NEVER_OPENED',
      { ...baseWhere, firstOpenedAt: null, createdAt: { lte: new Date(now.getTime() - this.config.neverOpenedHours * HOUR_MS) } },
      () => true,
      now,
      result,
    );
    await this.scan(
      'SIGNATURE_EXPIRING',
      { ...baseWhere, expiresAt: { gt: now, lte: new Date(now.getTime() + this.config.expiringHours * HOUR_MS) } },
      (c) => c.expiresAt.getTime() - c.createdAt.getTime() > this.config.expiringHours * HOUR_MS,
      now,
      result,
    );
    return result;
  }

  private async scan(
    type: SignatureLinkAlertType,
    where: Prisma.ContractPublicSignatureWhereInput,
    extraFilter: (candidate: Candidate) => boolean,
    now: Date,
    result: SignatureAlertsJobResult,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const batch = (await this.prisma.contractPublicSignature.findMany({
        where: { ...where, alerts: { none: { type } } },
        select: {
          id: true,
          officeId: true,
          contractVersionId: true,
          createdAt: true,
          expiresAt: true,
          firstOpenedAt: true,
          contract: {
            select: {
              id: true,
              number: true,
              status: true,
              responsibleId: true,
              versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })) as Candidate[];

      if (batch.length === 0) break;

      for (const candidate of batch) {
        // O link só vale para a versão ATUAL: versão mais nova = link inválido.
        if (candidate.contract.versions[0]?.id !== candidate.contractVersionId) continue;
        if (!extraFilter(candidate)) continue;
        result.processed += 1;
        if (await this.alertOne(type, candidate, now)) result.notified += 1;
        else result.skipped += 1;
      }

      const last = batch[batch.length - 1];
      if (batch.length < BATCH_SIZE || !last) break;
      cursor = last.id;
    }
  }

  private async alertOne(type: SignatureLinkAlertType, c: Candidate, now: Date): Promise<boolean> {
    const isNeverOpened = type === 'SIGNATURE_NEVER_OPENED';
    const title = isNeverOpened ? 'Cliente ainda não abriu o link de assinatura' : 'Link de assinatura próximo da expiração';
    const description = isNeverOpened
      ? buildNeverOpenedDescription(c.contract.number, this.config.neverOpenedHours)
      : buildExpiringDescription(c.contract.number, this.config.expiringHours);

    const alerted = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Reavalia o estado do link no momento da reivindicação (pode ter sido usado/revogado entre a leitura e agora).
      const stillActive = await tx.contractPublicSignature.findFirst({
        where: {
          id: c.id,
          officeId: c.officeId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          ...(isNeverOpened ? { firstOpenedAt: null } : {}),
        },
        select: { id: true },
      });
      if (!stillActive) return false;

      const claimed = await tx.signatureLinkAlert.createMany({ data: [{ signatureId: c.id, type }], skipDuplicates: true });
      if (claimed.count === 0) return false;

      await createNotification(tx, {
        officeId: c.officeId,
        userId: c.contract.responsibleId,
        type: 'WARNING',
        title,
        description,
        priority: !isNeverOpened,
        link: `/contratos/${c.contract.id}`,
      });
      await writeAuditLog(tx, {
        officeId: c.officeId,
        actorId: null,
        actorLabel: SYSTEM_ACTOR_LABEL,
        action: AUDIT_ACTIONS.SIGNATURE_LINK_ALERT_SENT,
        entityType: 'Contract',
        entityId: c.contract.id,
        entityLabel: `Contrato #${c.contract.number}`,
      });
      return true;
    });

    if (alerted && this.dispatcher) {
      const pushEvent = isNeverOpened ? PUSH_EVENT_TYPES.SIGNATURE_NEVER_OPENED : PUSH_EVENT_TYPES.SIGNATURE_EXPIRING;
      await this.dispatcher.dispatch({
        officeId: c.officeId,
        pushEvent,
        responsibleId: c.contract.responsibleId,
        // Push sem link, token, nome do cliente ou CPF.
        push: { type: pushEvent, title, body: description, url: `/contratos/${c.contract.id}`, tag: `sigalert:${c.id}:${type}` },
        email: { subject: title, text: description, userIds: [c.contract.responsibleId], contractId: c.contract.id },
      });
    }
    return alerted;
  }
}
