import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { PAYMENT_METHOD_FROM_API } from '../../shared/domain/status-map';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { PaymentWithRelations } from '../../shared/utils/serialize-payment';
import type {
  CreatePaymentBody,
  ListPaymentsQuery,
  RegisterPaymentBody,
  UpdatePaymentBody,
} from './payment.schemas';

const PAYMENT_INCLUDE = {
  contract: { select: { id: true, number: true, client: { select: { id: true, name: true } } } },
};

const SOON_THRESHOLD_DAYS = 30;

export interface PaymentActor {
  userId: string;
  officeId: string;
}

/** Traduz o filtro de status (derivado, nunca persistido) em condições reais
 * de WHERE sobre os campos `status`/`dueDate` armazenados no banco. */
function statusFilterWhere(status: ListPaymentsQuery['status'], now: Date): Prisma.PaymentWhereInput | undefined {
  if (!status) return undefined;

  const soonLimit = new Date(now.getTime() + SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  switch (status) {
    case 'pago':
      return { status: 'PAID' };
    case 'cancelado':
      return { status: 'CANCELLED' };
    case 'atrasado':
      return { status: 'PENDING', dueDate: { lt: now } };
    case 'pendente':
      return { status: 'PENDING', dueDate: { gte: now, lte: soonLimit } };
    case 'futuro':
      return { status: 'PENDING', dueDate: { gt: soonLimit } };
    default:
      return undefined;
  }
}

export class PaymentService {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'payment' | 'contract' | 'auditLog' | '$transaction'>,
  ) {}

  async list(officeId: string, query: ListPaymentsQuery, now = new Date()): Promise<Paginated<PaymentWithRelations>> {
    const where: Prisma.PaymentWhereInput = {
      officeId,
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.clientId ? { contract: { clientId: query.clientId } } : {}),
      ...(statusFilterWhere(query.status, now) ?? {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: { dueDate: 'asc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.payment.count({ where }),
    ]);

    return toPaginated(data as PaymentWithRelations[], total, query as PaginationQuery);
  }

  /** Indicadores agregados para os cards do topo da PaymentsPage. Calculado
   * no banco (nunca somando páginas no frontend, que ficaria incorreto
   * assim que houvesse mais registros do que uma página). */
  async summary(
    officeId: string,
    now = new Date(),
  ): Promise<{ totalPaid: number; totalPending: number; totalOverdue: number; receivableNext30Days: number }> {
    const soonLimit = new Date(now.getTime() + SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    const [paid, pending, overdue, soon] = await Promise.all([
      this.prisma.payment.aggregate({ where: { officeId, status: 'PAID' }, _sum: { value: true } }),
      this.prisma.payment.aggregate({ where: { officeId, status: 'PENDING', dueDate: { gte: now } }, _sum: { value: true } }),
      this.prisma.payment.aggregate({ where: { officeId, status: 'PENDING', dueDate: { lt: now } }, _sum: { value: true } }),
      this.prisma.payment.aggregate({
        where: { officeId, status: 'PENDING', dueDate: { gte: now, lte: soonLimit } },
        _sum: { value: true },
      }),
    ]);

    return {
      totalPaid: paid._sum.value ? paid._sum.value.toNumber() : 0,
      totalPending: pending._sum.value ? pending._sum.value.toNumber() : 0,
      totalOverdue: overdue._sum.value ? overdue._sum.value.toNumber() : 0,
      receivableNext30Days: soon._sum.value ? soon._sum.value.toNumber() : 0,
    };
  }

  async getById(officeId: string, id: string): Promise<PaymentWithRelations> {
    const payment = await this.prisma.payment.findFirst({ where: { id, officeId }, include: PAYMENT_INCLUDE });

    if (!payment) {
      throw new NotFoundError('Pagamento não encontrado');
    }

    return payment as PaymentWithRelations;
  }

  async create(actor: PaymentActor, data: CreatePaymentBody): Promise<PaymentWithRelations> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: data.contractId, officeId: actor.officeId },
    });
    if (!contract) {
      throw new NotFoundError('Contrato não encontrado');
    }

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.create({
        data: { ...data, officeId: actor.officeId },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.CREATED,
        entityType: 'Payment',
        entityId: payment.id,
        entityLabel: `Parcela ${payment.installmentNumber}/${payment.installmentTotal} do contrato #${contract.number}`,
      });

      return payment;
    });

    return this.getById(actor.officeId, created.id);
  }

  async update(actor: PaymentActor, id: string, data: UpdatePaymentBody): Promise<PaymentWithRelations> {
    const existing = await this.getById(actor.officeId, id);

    if (existing.status !== 'PENDING') {
      throw new ConflictError('Só é possível editar uma parcela pendente');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.update({ where: { id }, data });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.PAYMENT_UPDATED,
        entityType: 'Payment',
        entityId: id,
        entityLabel: `Parcela ${payment.installmentNumber}/${payment.installmentTotal} do contrato #${existing.contract.number}`,
      });
    });

    return this.getById(actor.officeId, id);
  }

  async registerPayment(actor: PaymentActor, id: string, data: RegisterPaymentBody): Promise<PaymentWithRelations> {
    const existing = await this.getById(actor.officeId, id);

    if (existing.status === 'PAID') {
      throw new ConflictError('Este pagamento já foi registrado');
    }
    if (existing.status === 'CANCELLED') {
      throw new ConflictError('Não é possível registrar pagamento de uma parcela cancelada');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.update({
        where: { id },
        data: {
          status: 'PAID',
          method: PAYMENT_METHOD_FROM_API(data.method),
          paidAt: data.paidAt ?? new Date(),
        },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.PAYMENT_REGISTERED,
        entityType: 'Payment',
        entityId: id,
        entityLabel: `Parcela ${payment.installmentNumber}/${payment.installmentTotal} do contrato #${existing.contract.number}`,
      });
    });

    return this.getById(actor.officeId, id);
  }
}
