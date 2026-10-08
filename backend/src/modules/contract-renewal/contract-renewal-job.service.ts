import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, SYSTEM_ACTOR_LABEL, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { RENEWAL_ALERT_CONTRACT_STATUSES } from '../../shared/domain/status-map';
import { DAY_MS, daysUntil, formatDateBR, startOfUtcDay } from '../../shared/utils/dates';
import { notifyPushEvent } from '../notifications/push-recipients';
import { PUSH_EVENT_TYPES, type PushNotifier } from '../notifications/push.types';

/** Janela do alerta: contratos que terminam em até N dias (inclusive). */
export const RENEWAL_ALERT_WINDOW_DAYS = 30;
/** A partir de quantos dias restantes a notificação é marcada como prioritária. */
export const RENEWAL_ALERT_PRIORITY_DAYS = 7;

const BATCH_SIZE = 200;

export interface RenewalJobResult {
  /** Contratos elegíveis encontrados na janela. */
  processed: number;
  /** Alertas efetivamente criados nesta execução. */
  notified: number;
  /** Elegíveis que não geraram alerta (já alertados para o mesmo endDate ou reivindicados por outra execução). */
  skipped: number;
}

type PrismaDeps = Pick<PrismaClient, 'contract' | 'notification' | 'auditLog' | 'user' | '$transaction'>;

// Mantidos como re-exports: outros módulos e testes importam estes nomes daqui.
export { daysUntil, startOfUtcDay };

export function buildRenewalAlertDescription(input: {
  number: number;
  clientName: string;
  endDate: Date;
  days: number;
}): string {
  const end = formatDateBR(input.endDate);
  const subject = `O contrato #${input.number} de ${input.clientName}`;
  if (input.days <= 0) return `${subject} termina hoje (${end}).`;
  const unit = input.days === 1 ? 'dia' : 'dias';
  return `${subject} termina em ${end} e está a ${input.days} ${unit} do vencimento.`;
}

/** Corpo curto do Web Push (pode aparecer na tela bloqueada): sem nome de cliente nem datas. */
export function buildRenewalPushBody(input: { number: number; days: number }): string {
  const subject = `O contrato #${input.number}`;
  if (input.days <= 0) return `${subject} vence hoje.`;
  return `${subject} vence em ${input.days} ${input.days === 1 ? 'dia' : 'dias'}.`;
}

/**
 * Job diário de alerta de renovação. Executado via POST /internal/jobs/contract-renewal-alerts
 * (GitHub Actions) — sem servidor de cron dedicado.
 *
 * Elegível: status ATIVO/ASSINADO, endDate preenchido e dentro de [hoje, hoje + 30 dias]
 * (dias-calendário UTC). Contratos já vencidos (endDate < hoje) NÃO geram alerta: o alerta
 * é preventivo ("próximo do vencimento").
 *
 * Idempotência (garantida no banco, não em memória): cada alerta "reivindica" o contrato com
 * um UPDATE condicional que só afeta a linha se `renewalAlertForEndDate` for NULL ou diferente
 * do endDate lido. Notification e AuditLog são criados na MESMA transação da reivindicação.
 * Duas execuções concorrentes serializam no lock da linha; a segunda reavalia o WHERE (READ
 * COMMITTED), vê count = 0 e não notifica. Se o endDate mudar depois, o valor deixa de
 * coincidir e um novo ciclo de alerta fica elegível.
 *
 * Web Push (opcional): o aviso de navegador é enviado SOMENTE quando esta execução venceu a
 * reivindicação acima e a transação foi confirmada — ou seja, exatamente 1 disparo por
 * Notification criada, com a mesma idempotência. Vai para o responsável + ADMINs ativos do
 * escritório (política em notifications/push-recipients.ts), sem duplicar quem é as duas coisas.
 * Falha de push nunca afeta o job.
 */
export class ContractRenewalJobService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly push?: PushNotifier,
  ) {}

  async run(now: Date = new Date()): Promise<RenewalJobResult> {
    const today = startOfUtcDay(now);
    const windowEnd = new Date(today.getTime() + RENEWAL_ALERT_WINDOW_DAYS * DAY_MS);
    const result: RenewalJobResult = { processed: 0, notified: 0, skipped: 0 };

    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.contract.findMany({
        where: {
          status: { in: RENEWAL_ALERT_CONTRACT_STATUSES },
          endDate: { gte: today, lte: windowEnd },
        },
        select: {
          id: true,
          number: true,
          officeId: true,
          responsibleId: true,
          endDate: true,
          updatedAt: true,
          renewalAlertForEndDate: true,
          client: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (batch.length === 0) break;

      for (const contract of batch) {
        if (!contract.endDate) continue; // já filtrado no where; satisfaz o type narrowing
        result.processed += 1;

        const alerted = await this.alertOne(
          { ...contract, endDate: contract.endDate },
          now,
        );
        if (alerted) result.notified += 1;
        else result.skipped += 1;
      }

      const last = batch[batch.length - 1];
      if (batch.length < BATCH_SIZE || !last) break;
      cursor = last.id;
    }

    return result;
  }

  private async alertOne(
    contract: {
      id: string;
      number: number;
      officeId: string;
      responsibleId: string;
      endDate: Date;
      updatedAt: Date;
      renewalAlertForEndDate: Date | null;
      client: { name: string };
    },
    now: Date,
  ): Promise<boolean> {
    // Atalho barato: já alertado para este mesmo endDate. A garantia real é o UPDATE condicional abaixo.
    if (contract.renewalAlertForEndDate && contract.renewalAlertForEndDate.getTime() === contract.endDate.getTime()) {
      return false;
    }

    const days = daysUntil(contract.endDate, now);

    const alerted = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.contract.updateMany({
        where: {
          id: contract.id,
          officeId: contract.officeId,
          endDate: contract.endDate,
          // Se o contrato foi editado/encerrado depois da leitura, não alertamos com dado velho;
          // a próxima execução diária o reavalia.
          updatedAt: contract.updatedAt,
          status: { in: RENEWAL_ALERT_CONTRACT_STATUSES },
          OR: [{ renewalAlertForEndDate: null }, { renewalAlertForEndDate: { not: contract.endDate } }],
        },
        data: {
          renewalAlertSentAt: now,
          renewalAlertForEndDate: contract.endDate,
          // Preserva updatedAt: o alerta não é uma edição do contrato (não deve reordenar a listagem).
          updatedAt: contract.updatedAt,
        },
      });

      if (claimed.count === 0) return false;

      await createNotification(tx, {
        officeId: contract.officeId,
        userId: contract.responsibleId,
        type: 'WARNING',
        title: 'Contrato próximo do vencimento',
        description: buildRenewalAlertDescription({
          number: contract.number,
          clientName: contract.client.name,
          endDate: contract.endDate,
          days,
        }),
        priority: days <= RENEWAL_ALERT_PRIORITY_DAYS,
      });

      await writeAuditLog(tx, {
        officeId: contract.officeId,
        actorId: null,
        actorLabel: SYSTEM_ACTOR_LABEL,
        action: AUDIT_ACTIONS.RENEWAL_ALERT_SENT,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: `Contrato #${contract.number}`,
      });

      return true;
    });

    // Fora da transação: nunca enviar push de algo que ainda pode sofrer rollback.
    // Destinatários (responsável + ADMINs ativos do escritório) vêm da política central
    // (notifications/push-recipients.ts). notifyPushEvent nunca lança.
    if (alerted) {
      await notifyPushEvent(
        { prisma: this.prisma, push: this.push },
        PUSH_EVENT_TYPES.CONTRACT_RENEWAL,
        { officeId: contract.officeId, responsibleId: contract.responsibleId },
        {
          type: PUSH_EVENT_TYPES.CONTRACT_RENEWAL,
          title: 'Contrato próximo do vencimento',
          body: buildRenewalPushBody({ number: contract.number, days }),
          url: `/contratos/${contract.id}`,
          tag: `renewal:${contract.id}`,
        },
      );
    }

    return alerted;
  }
}
