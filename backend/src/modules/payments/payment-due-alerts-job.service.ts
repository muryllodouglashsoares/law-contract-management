import type { PaymentAlertType, Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, SYSTEM_ACTOR_LABEL, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { addUtcDays, startOfUtcDay, utcDayRange } from '../../shared/utils/dates';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher';
import { PUSH_EVENT_TYPES, type PushEventType } from '../notifications/push.types';

const BATCH_SIZE = 200;

export interface PaymentAlertsJobResult {
  /** Parcelas elegíveis encontradas (por regra, na data de hoje). */
  processed: number;
  /** Alertas efetivamente criados nesta execução. */
  notified: number;
  /** Elegíveis que não geraram alerta (já alertadas ou reivindicadas por outra execução). */
  skipped: number;
  /** false = job desabilitado por PAYMENT_ALERT_ENABLED=false (nada foi processado). */
  enabled: boolean;
}

interface AlertRule {
  type: PaymentAlertType;
  /** dueDate = hoje + offsetDays (dias-calendário UTC). */
  offsetDays: number;
  notificationType: 'INFO' | 'WARNING' | 'ERROR';
  priority: boolean;
  title: string;
  pushEvent: Extract<PushEventType, 'PAYMENT_DUE_SOON' | 'PAYMENT_DUE_TODAY' | 'PAYMENT_OVERDUE'>;
  pushTitle: string;
}

/**
 * Regras (spec): 3 dias antes, no dia, e 1 dia depois do vencimento. Só parcelas PENDING —
 * PAID e CANCELLED nunca geram alerta. "Atraso" continua DERIVADO da dueDate (nenhum status
 * OVERDUE é persistido).
 */
export const PAYMENT_ALERT_RULES: readonly AlertRule[] = [
  {
    type: 'BEFORE_3_DAYS',
    offsetDays: 3,
    notificationType: 'INFO',
    priority: false,
    title: 'Pagamento próximo do vencimento',
    pushEvent: PUSH_EVENT_TYPES.PAYMENT_DUE_SOON,
    pushTitle: 'Pagamento próximo do vencimento',
  },
  {
    type: 'DUE_TODAY',
    offsetDays: 0,
    notificationType: 'WARNING',
    priority: true,
    title: 'Pagamento vence hoje',
    pushEvent: PUSH_EVENT_TYPES.PAYMENT_DUE_TODAY,
    pushTitle: 'Pagamento vence hoje',
  },
  {
    type: 'AFTER_1_DAY',
    offsetDays: -1,
    notificationType: 'ERROR',
    priority: true,
    title: 'Pagamento em atraso',
    pushEvent: PUSH_EVENT_TYPES.PAYMENT_OVERDUE,
    pushTitle: 'Pagamento em atraso',
  },
];

export function buildPaymentAlertDescription(type: PaymentAlertType, input: { installment: string; contractNumber: number }): string {
  const subject = `A parcela ${input.installment} do contrato #${input.contractNumber}`;
  switch (type) {
    case 'BEFORE_3_DAYS':
      return `${subject} vence em 3 dias.`;
    case 'DUE_TODAY':
      return `${subject} vence hoje.`;
    case 'AFTER_1_DAY':
      return `${subject} está em atraso há 1 dia.`;
  }
}

/** Corpo curto do push (pode aparecer na tela bloqueada): só o número do contrato — sem valores nem cliente. */
export function buildPaymentAlertPushBody(type: PaymentAlertType, contractNumber: number): string {
  switch (type) {
    case 'BEFORE_3_DAYS':
      return `Pagamento do contrato #${contractNumber} vence em 3 dias.`;
    case 'DUE_TODAY':
      return `Pagamento do contrato #${contractNumber} vence hoje.`;
    case 'AFTER_1_DAY':
      return `Pagamento do contrato #${contractNumber} está em atraso há 1 dia.`;
  }
}

type PrismaDeps = Pick<PrismaClient, 'payment' | 'paymentAlertEvent' | 'notification' | 'auditLog' | '$transaction'>;

interface EligiblePayment {
  id: string;
  officeId: string;
  installmentNumber: number;
  installmentTotal: number;
  contract: { id: string; number: number; responsibleId: string };
}

/**
 * Job diário de alertas de pagamento. Executado via POST /internal/jobs/payment-due-alerts
 * (GitHub Actions) — mesmo mecanismo do job de renovação, sem servidor de cron próprio.
 *
 * Idempotência (garantida NO BANCO): cada alerta primeiro "reivindica" a parcela inserindo uma
 * linha em payment_alert_events (UNIQUE paymentId + type, ON CONFLICT DO NOTHING). Notification e
 * AuditLog são criados na MESMA transação da reivindicação; se `count = 0` outra execução já
 * alertou e nada é criado. Execuções concorrentes serializam no índice único.
 *
 * Canais externos (Web Push / e-mail) rodam DEPOIS do commit, exatamente uma vez por alerta criado,
 * via NotificationDispatcher — que respeita as preferências do usuário e nunca lança. O job continua
 * funcionando com Web Push e e-mail desativados.
 */
export class PaymentDueAlertsJobService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly dispatcher?: NotificationDispatcher,
    private readonly enabled: boolean = true,
  ) {}

  async run(now: Date = new Date()): Promise<PaymentAlertsJobResult> {
    const result: PaymentAlertsJobResult = { processed: 0, notified: 0, skipped: 0, enabled: this.enabled };
    if (!this.enabled) return result;

    const today = startOfUtcDay(now);

    for (const rule of PAYMENT_ALERT_RULES) {
      const dueRange = utcDayRange(addUtcDays(today, rule.offsetDays));
      let cursor: string | undefined;

      for (;;) {
        const batch = (await this.prisma.payment.findMany({
          where: {
            status: 'PENDING',
            dueDate: dueRange,
            // Contrato cancelado não gera cobrança de alerta.
            contract: { status: { not: 'CANCELADO' } },
          },
          select: {
            id: true,
            officeId: true,
            installmentNumber: true,
            installmentTotal: true,
            contract: { select: { id: true, number: true, responsibleId: true } },
          },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        })) as EligiblePayment[];

        if (batch.length === 0) break;

        for (const payment of batch) {
          result.processed += 1;
          const alerted = await this.alertOne(rule, payment, now);
          if (alerted) result.notified += 1;
          else result.skipped += 1;
        }

        const last = batch[batch.length - 1];
        if (batch.length < BATCH_SIZE || !last) break;
        cursor = last.id;
      }
    }

    return result;
  }

  private async alertOne(rule: AlertRule, payment: EligiblePayment, _now: Date): Promise<boolean> {
    const installment = `${payment.installmentNumber}/${payment.installmentTotal}`;
    const description = buildPaymentAlertDescription(rule.type, { installment, contractNumber: payment.contract.number });

    const alerted = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Se a parcela foi paga/cancelada depois da leitura em lote, não alertamos.
      const stillPending = await tx.payment.findFirst({
        where: { id: payment.id, officeId: payment.officeId, status: 'PENDING' },
        select: { id: true },
      });
      if (!stillPending) return false;

      const claimed = await tx.paymentAlertEvent.createMany({
        data: [{ paymentId: payment.id, type: rule.type }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return false;

      await createNotification(tx, {
        officeId: payment.officeId,
        userId: payment.contract.responsibleId,
        type: rule.notificationType,
        title: rule.title,
        description,
        priority: rule.priority,
        link: `/contratos/${payment.contract.id}`,
      });

      await writeAuditLog(tx, {
        officeId: payment.officeId,
        actorId: null,
        actorLabel: SYSTEM_ACTOR_LABEL,
        action: AUDIT_ACTIONS.PAYMENT_ALERT_SENT,
        entityType: 'Payment',
        entityId: payment.id,
        // Sem valores financeiros no rótulo (aparece na tela de histórico).
        entityLabel: `Parcela ${installment} do contrato #${payment.contract.number}`,
      });

      return true;
    });

    // Fora da transação: nunca enviar push/e-mail de algo que ainda pode sofrer rollback.
    if (alerted && this.dispatcher) {
      await this.dispatcher.dispatch({
        officeId: payment.officeId,
        pushEvent: rule.pushEvent,
        responsibleId: payment.contract.responsibleId,
        push: {
          type: rule.pushEvent,
          title: rule.pushTitle,
          body: buildPaymentAlertPushBody(rule.type, payment.contract.number),
          url: `/pagamentos`,
          tag: `payment:${payment.id}:${rule.type}`,
        },
        email: {
          subject: rule.title,
          text: description,
          userIds: [payment.contract.responsibleId],
          contractId: payment.contract.id,
        },
      });
    }

    return alerted;
  }
}
