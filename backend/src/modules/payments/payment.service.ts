import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { startOfUtcDay } from '../../shared/utils/dates';
import { buildInstallmentPlan, toCents } from '../../shared/utils/installments';
import { PAYMENT_METHOD_FROM_API } from '../../shared/domain/status-map';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { PaymentWithRelations } from '../../shared/utils/serialize-payment';
import type {
  CreatePaymentBody,
  GenerateInstallmentsBody,
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

  // Dias-calendário UTC: parcela que vence hoje ainda não está atrasada.
  const today = startOfUtcDay(now);
  const soonLimit = new Date(today.getTime() + SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  switch (status) {
    case 'pago':
      return { status: 'PAID' };
    case 'cancelado':
      return { status: 'CANCELLED' };
    case 'atrasado':
      return { status: 'PENDING', dueDate: { lt: today } };
    case 'pendente':
      return { status: 'PENDING', dueDate: { gte: today, lte: soonLimit } };
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
    const today = startOfUtcDay(now);
    const soonLimit = new Date(today.getTime() + SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    const [paid, pending, overdue, soon] = await Promise.all([
      this.prisma.payment.aggregate({ where: { officeId, status: 'PAID' }, _sum: { value: true } }),
      this.prisma.payment.aggregate({ where: { officeId, status: 'PENDING', dueDate: { gte: today } }, _sum: { value: true } }),
      this.prisma.payment.aggregate({ where: { officeId, status: 'PENDING', dueDate: { lt: today } }, _sum: { value: true } }),
      this.prisma.payment.aggregate({
        where: { officeId, status: 'PENDING', dueDate: { gte: today, lte: soonLimit } },
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

  /**
   * Prévia do parcelamento (NÃO grava nada). O cálculo é sempre do backend — o frontend só exibe.
   * `existingCount` = parcelas não canceladas já existentes: se > 0, a geração é bloqueada.
   */
  async previewInstallments(actor: PaymentActor, data: GenerateInstallmentsBody) {
    const contract = await this.getContractForInstallments(actor.officeId, data.contractId);
    const existingCount = await this.prisma.payment.count({
      where: { contractId: contract.id, officeId: actor.officeId, status: { not: 'CANCELLED' } },
    });
    const { totalValue, installments } = this.buildPlan(data);
    return { totalValue, installments, existingCount, contractNumber: contract.number };
  }

  /**
   * Gera TODAS as parcelas de uma vez, de forma atômica. Segurança contra duplicidade: a transação
   * trava a linha do contrato (SELECT ... FOR UPDATE) e só cria se NÃO houver parcela não cancelada
   * — duas requisições simultâneas não geram o parcelamento duas vezes. Nada existente é apagado.
   */
  async generateInstallments(actor: PaymentActor, data: GenerateInstallmentsBody) {
    const contract = await this.getContractForInstallments(actor.officeId, data.contractId);
    const plan = this.buildPlan(data);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT "id" FROM "contracts" WHERE "id" = ${contract.id} AND "officeId" = ${actor.officeId} FOR UPDATE`;

      const existing = await tx.payment.count({
        where: { contractId: contract.id, officeId: actor.officeId, status: { not: 'CANCELLED' } },
      });
      if (existing > 0) {
        throw new ConflictError('Este contrato já possui parcelas. Cancele as existentes antes de gerar um novo parcelamento.');
      }

      await tx.payment.createMany({
        data: plan.items.map((item) => ({
          officeId: actor.officeId,
          contractId: contract.id,
          installmentNumber: item.installmentNumber,
          installmentTotal: item.installmentTotal,
          value: item.value,
          dueDate: item.dueDate,
        })),
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.PAYMENT_INSTALLMENTS_GENERATED,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: `Contrato #${contract.number} (${plan.items.length} parcelas)`,
      });
    });

    return this.list(actor.officeId, { contractId: contract.id, page: 1, pageSize: 100 });
  }

  private buildPlan(data: GenerateInstallmentsBody) {
    const totalCents = toCents(data.totalValue);
    if (totalCents === null) throw new ConflictError('Valor total inválido');
    const items = buildInstallmentPlan({ totalCents, count: data.installmentCount, firstDueDate: data.firstDueDate });
    return {
      totalValue: totalCents / 100,
      items,
      /** Formato público (prévia/resposta): valores em reais calculados a partir dos centavos exatos. */
      installments: items.map((item) => ({
        installmentNumber: item.installmentNumber,
        installmentTotal: item.installmentTotal,
        value: item.cents / 100,
        dueDate: item.dueDate.toISOString(),
      })),
    };
  }

  private async getContractForInstallments(officeId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, officeId },
      select: { id: true, number: true, status: true },
    });
    if (!contract) throw new NotFoundError('Contrato não encontrado');
    if (contract.status === 'CANCELADO') {
      throw new ConflictError('Não é possível gerar parcelas para um contrato cancelado');
    }
    return contract;
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
        action: data.method === 'PIX' ? AUDIT_ACTIONS.PIX_PAYMENT_REGISTERED : AUDIT_ACTIONS.PAYMENT_REGISTERED,
        entityType: 'Payment',
        entityId: id,
        entityLabel: `Parcela ${payment.installmentNumber}/${payment.installmentTotal} do contrato #${existing.contract.number}`,
      });
    });

    return this.getById(actor.officeId, id);
  }
}
