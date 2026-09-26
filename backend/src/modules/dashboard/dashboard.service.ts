import type { ContractStatus, PrismaClient } from '@prisma/client';

import { toPublicAuditLog, type AuditLogWithActor } from '../../shared/utils/serialize-audit-log';
import { toPublicContract, type ContractWithRelations } from '../../shared/utils/serialize-contract';
import { toMoneyNumber } from '../../shared/utils/money';
import { toPublicPayment, type PaymentWithRelations } from '../../shared/utils/serialize-payment';

/**
 * Mesmo conjunto de status, rótulos e cores já usado pelo gráfico
 * "Contratos por status" no frontend (src/data/mock.ts#contractStatusChart),
 * para que o BarChart existente não precise de nenhuma alteração.
 */
const CHART_STATUSES: { status: ContractStatus; label: string; color: string }[] = [
  { status: 'RASCUNHO', label: 'Rascunho', color: '#94A3B8' },
  { status: 'ENVIADO', label: 'Enviado', color: '#60A5FA' },
  { status: 'EM_REVISAO', label: 'Em revisão', color: '#F59E0B' },
  { status: 'ASSINADO', label: 'Assinado', color: '#14B8A6' },
  { status: 'ATIVO', label: 'Ativo', color: '#10B981' },
  { status: 'ENCERRADO', label: 'Encerrado', color: '#64748B' },
];

const CONTRACT_INCLUDE = {
  client: { select: { id: true, name: true, document: true, email: true } },
  template: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
  versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
};

const PAYMENT_INCLUDE = {
  contract: { select: { id: true, number: true, client: { select: { id: true, name: true } } } },
};

const SOON_WINDOW_DAYS = 30;

type PrismaDeps = Pick<PrismaClient, 'client' | 'contract' | 'payment' | 'auditLog'>;

export interface DashboardSummary {
  metrics: {
    activeClients: number;
    newClientsThisMonth: number;
    activeContracts: number;
    pendingActionContracts: number;
    overduePaymentsCount: number;
    receivableNext30Days: number;
  };
  contractStatusChart: { name: string; value: number; color: string }[];
  recentContracts: ReturnType<typeof toPublicContract>[];
  recentActivity: ReturnType<typeof toPublicAuditLog>[];
  upcomingPayments: ReturnType<typeof toPublicPayment>[];
}

export class DashboardService {
  constructor(private readonly prisma: PrismaDeps) {}

  async summary(officeId: string, now = new Date()): Promise<DashboardSummary> {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const soonLimit = new Date(now.getTime() + SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [
      activeClients,
      newClientsThisMonth,
      activeContracts,
      pendingActionContracts,
      statusCounts,
      receivable,
      overduePaymentsCount,
      recentContractsRaw,
      recentAuditLogsRaw,
      upcomingPaymentsRaw,
    ] = await Promise.all([
      this.prisma.client.count({ where: { officeId, status: 'ACTIVE' } }),
      this.prisma.client.count({ where: { officeId, status: 'ACTIVE', createdAt: { gte: startOfMonth } } }),
      this.prisma.contract.count({ where: { officeId, status: 'ATIVO' } }),
      this.prisma.contract.count({
        where: { officeId, status: { in: ['PRONTO_ENVIO', 'ENVIADO', 'EM_REVISAO'] } },
      }),
      Promise.all(
        CHART_STATUSES.map((s) => this.prisma.contract.count({ where: { officeId, status: s.status } })),
      ),
      this.prisma.payment.aggregate({
        where: { officeId, status: 'PENDING', dueDate: { gte: now, lte: soonLimit } },
        _sum: { value: true },
      }),
      this.prisma.payment.count({ where: { officeId, status: 'PENDING', dueDate: { lt: now } } }),
      this.prisma.contract.findMany({
        where: { officeId },
        include: CONTRACT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 4,
      }),
      this.prisma.auditLog.findMany({
        where: { officeId },
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.payment.findMany({
        where: { officeId, status: 'PENDING', dueDate: { gte: now, lte: soonLimit } },
        include: PAYMENT_INCLUDE,
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);

    return {
      metrics: {
        activeClients,
        newClientsThisMonth,
        activeContracts,
        pendingActionContracts,
        overduePaymentsCount,
        receivableNext30Days: receivable._sum.value ? toMoneyNumber(receivable._sum.value) : 0,
      },
      contractStatusChart: CHART_STATUSES.map((s, i) => ({ name: s.label, value: statusCounts[i] ?? 0, color: s.color })),
      recentContracts: (recentContractsRaw as ContractWithRelations[]).map(toPublicContract),
      recentActivity: (recentAuditLogsRaw as AuditLogWithActor[]).map(toPublicAuditLog),
      upcomingPayments: (upcomingPaymentsRaw as PaymentWithRelations[]).map((p) => toPublicPayment(p, now)),
    };
  }
}
