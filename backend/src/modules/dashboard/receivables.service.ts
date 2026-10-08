import { Readable } from 'node:stream';

import { Prisma, type PrismaClient } from '@prisma/client';

import { ValidationError } from '../../shared/errors';
import { DAY_MS, addUtcDays, addMonthsClamped, startOfUtcDay, daysUntil } from '../../shared/utils/dates';
import { derivePaymentDisplayStatus, PAYMENT_METHOD_TO_API } from '../../shared/domain/status-map';

/**
 * Dashboard financeiro (inadimplência e receita). TODO o cálculo é feito no banco/backend e sempre
 * filtrado por officeId. Valores são somados em CENTAVOS (bigint) — nunca em ponto flutuante.
 *
 * Definições:
 *  - Receita recebida: parcelas PAID com paidAt dentro do período (data em horário de Brasília).
 *  - Receita prevista: parcelas não canceladas com vencimento dentro do período.
 *  - Receita em atraso: parcelas PENDING com vencimento no período e anterior a hoje.
 *  - Inadimplência (cards/tabela): estado ATUAL — toda parcela PENDING vencida antes de hoje,
 *    independentemente do período selecionado.
 */

export const REPORT_TIMEZONE = 'America/Sao_Paulo';
export const MAX_CUSTOM_RANGE_DAYS = 366 * 3;

export const RECEIVABLE_PERIODS = ['this_month', 'last_month', 'last_3_months', 'last_6_months', 'year', 'custom'] as const;
export type ReceivablePeriod = (typeof RECEIVABLE_PERIODS)[number];

export interface DateRange {
  /** Primeiro dia (inclusive), 00:00 UTC. */
  from: Date;
  /** Último dia (inclusive), 00:00 UTC. */
  to: Date;
}

export function resolvePeriod(period: ReceivablePeriod, now: Date, custom?: { from?: Date; to?: Date }): DateRange {
  const today = startOfUtcDay(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = (start: Date) => addUtcDays(addMonthsClamped(start, 1), -1);

  switch (period) {
    case 'this_month':
      return { from: monthStart, to: monthEnd(monthStart) };
    case 'last_month': {
      const start = addMonthsClamped(monthStart, -1);
      return { from: start, to: monthEnd(start) };
    }
    case 'last_3_months':
      return { from: addMonthsClamped(monthStart, -2), to: monthEnd(monthStart) };
    case 'last_6_months':
      return { from: addMonthsClamped(monthStart, -5), to: monthEnd(monthStart) };
    case 'year':
      return { from: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), to: new Date(Date.UTC(today.getUTCFullYear(), 11, 31)) };
    case 'custom': {
      if (!custom?.from || !custom.to) {
        throw new ValidationError('Informe as datas inicial e final do período personalizado');
      }
      const from = startOfUtcDay(custom.from);
      const to = startOfUtcDay(custom.to);
      if (from.getTime() > to.getTime()) throw new ValidationError('A data inicial não pode ser posterior à data final');
      if ((to.getTime() - from.getTime()) / DAY_MS > MAX_CUSTOM_RANGE_DAYS) {
        throw new ValidationError('O período personalizado pode ter no máximo 3 anos');
      }
      return { from, to };
    }
  }
}

// Constante interna (nunca vem do usuário): literal no SQL evita inferência de tipo de parâmetro em GROUP BY.
const TZ_SQL = Prisma.raw(`'${REPORT_TIMEZONE}'`);

const cents = (value: bigint | number | null | undefined): number => Number(value ?? 0) / 100;

export interface ReceivablesReport {
  period: { key: ReceivablePeriod; from: string; to: string };
  delinquency: {
    overdueCount: number;
    overdueTotal: number;
    contractsWithOverdue: number;
    maxDaysOverdue: number;
    averageDaysOverdue: number;
  };
  revenue: { received: number; expected: number; overdue: number };
  monthly: { month: string; received: number; expected: number; overdue: number }[];
  statusDistribution: { status: string; label: string; count: number; total: number; color: string }[];
}

const STATUS_DISTRIBUTION_META: Record<string, { label: string; color: string }> = {
  pago: { label: 'Pago', color: '#10B981' },
  pendente: { label: 'Pendente', color: '#F59E0B' },
  futuro: { label: 'A vencer', color: '#60A5FA' },
  atrasado: { label: 'Atrasado', color: '#EF4444' },
  cancelado: { label: 'Cancelado', color: '#94A3B8' },
};

type Db = Pick<PrismaClient, 'payment' | '$queryRaw'>;

export interface DelinquencyRow {
  paymentId: string;
  clientName: string;
  contractId: string;
  contractNumber: number;
  installment: string;
  value: number;
  dueDate: string;
  daysOverdue: number;
  responsibleName: string;
}

export interface ExportFilters {
  range: DateRange;
  scope: 'all' | 'overdue';
}

const EXPORT_BATCH = 500;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Evita injeção de fórmulas ao abrir o CSV no Excel/Sheets (=, +, -, @, tab, CR no início da célula). */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatMoneyPtBr(valueCents: number): string {
  const sign = valueCents < 0 ? '-' : '';
  const abs = Math.abs(valueCents);
  const whole = Math.floor(abs / 100).toString();
  return `${sign}${whole},${String(abs % 100).padStart(2, '0')}`;
}

export class ReceivablesService {
  constructor(private readonly prisma: Db) {}

  async report(officeId: string, key: ReceivablePeriod, range: DateRange, now = new Date()): Promise<ReceivablesReport> {
    const today = startOfUtcDay(now);
    const toExclusive = addUtcDays(range.to, 1);

    const [delinquency, revenue, monthlyRows, distribution] = await Promise.all([
      this.prisma.$queryRaw<
        { count: number; total: bigint | null; contracts: number; max_days: number | null; avg_days: number | null }[]
      >(Prisma.sql`
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(ROUND("value" * 100)), 0)::bigint AS total,
               COUNT(DISTINCT "contractId")::int AS contracts,
               MAX(${today}::date - "dueDate"::date)::int AS max_days,
               AVG(${today}::date - "dueDate"::date)::float8 AS avg_days
        FROM "payments"
        WHERE "officeId" = ${officeId} AND "status" = 'PENDING' AND "dueDate" < ${today}`),
      this.prisma.$queryRaw<{ received: bigint | null; expected: bigint | null; overdue: bigint | null }[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(ROUND("value" * 100)) FILTER (
            WHERE "status" = 'PAID' AND ("paidAt" AT TIME ZONE ${TZ_SQL})::date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::bigint AS received,
          COALESCE(SUM(ROUND("value" * 100)) FILTER (
            WHERE "status" <> 'CANCELLED' AND "dueDate" >= ${range.from} AND "dueDate" < ${toExclusive}), 0)::bigint AS expected,
          COALESCE(SUM(ROUND("value" * 100)) FILTER (
            WHERE "status" = 'PENDING' AND "dueDate" >= ${range.from} AND "dueDate" < ${toExclusive} AND "dueDate" < ${today}), 0)::bigint AS overdue
        FROM "payments" WHERE "officeId" = ${officeId}`),
      this.prisma.$queryRaw<{ month: Date; kind: string; total: bigint }[]>(Prisma.sql`
        SELECT date_trunc('month', "dueDate")::date AS month, 'expected' AS kind, SUM(ROUND("value" * 100))::bigint AS total
          FROM "payments"
         WHERE "officeId" = ${officeId} AND "status" <> 'CANCELLED' AND "dueDate" >= ${range.from} AND "dueDate" < ${toExclusive}
         GROUP BY 1
        UNION ALL
        SELECT date_trunc('month', "dueDate")::date, 'overdue', SUM(ROUND("value" * 100))::bigint
          FROM "payments"
         WHERE "officeId" = ${officeId} AND "status" = 'PENDING' AND "dueDate" >= ${range.from} AND "dueDate" < ${toExclusive} AND "dueDate" < ${today}
         GROUP BY 1
        UNION ALL
        SELECT date_trunc('month', "paidAt" AT TIME ZONE ${TZ_SQL})::date, 'received', SUM(ROUND("value" * 100))::bigint
          FROM "payments"
         WHERE "officeId" = ${officeId} AND "status" = 'PAID'
           AND ("paidAt" AT TIME ZONE ${TZ_SQL})::date BETWEEN ${range.from}::date AND ${range.to}::date
         GROUP BY 1`),
      this.prisma.$queryRaw<{ bucket: string; count: number; total: bigint }[]>(Prisma.sql`
        SELECT CASE
                 WHEN "status" = 'PAID' THEN 'pago'
                 WHEN "status" = 'CANCELLED' THEN 'cancelado'
                 WHEN "dueDate" < ${today} THEN 'atrasado'
                 WHEN "dueDate" <= ${addUtcDays(today, 30)} THEN 'pendente'
                 ELSE 'futuro' END AS bucket,
               COUNT(*)::int AS count, SUM(ROUND("value" * 100))::bigint AS total
          FROM "payments"
         WHERE "officeId" = ${officeId} AND "dueDate" >= ${range.from} AND "dueDate" < ${toExclusive}
         GROUP BY 1`),
    ]);

    // Série mensal completa (meses sem movimento aparecem zerados).
    const months = new Map<string, { month: string; received: number; expected: number; overdue: number }>();
    for (let cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1)); cursor <= range.to; cursor = addMonthsClamped(cursor, 1)) {
      months.set(monthKey(cursor), { month: monthKey(cursor), received: 0, expected: 0, overdue: 0 });
    }
    for (const row of monthlyRows) {
      const entry = months.get(monthKey(new Date(row.month)));
      if (entry && (row.kind === 'received' || row.kind === 'expected' || row.kind === 'overdue')) entry[row.kind] = cents(row.total);
    }

    const d = delinquency[0];
    const r = revenue[0];
    return {
      period: { key, from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
      delinquency: {
        overdueCount: d?.count ?? 0,
        overdueTotal: cents(d?.total),
        contractsWithOverdue: d?.contracts ?? 0,
        maxDaysOverdue: d?.max_days ?? 0,
        averageDaysOverdue: d?.avg_days ? Math.round(d.avg_days * 10) / 10 : 0,
      },
      revenue: { received: cents(r?.received), expected: cents(r?.expected), overdue: cents(r?.overdue) },
      monthly: [...months.values()],
      statusDistribution: Object.entries(STATUS_DISTRIBUTION_META).map(([status, meta]) => {
        const row = distribution.find((x) => x.bucket === status);
        return { status, ...meta, count: row?.count ?? 0, total: cents(row?.total) };
      }),
    };
  }

  /** Tabela de inadimplência: maiores atrasos primeiro e, no empate, maiores valores. Paginada. */
  async delinquencyTable(officeId: string, page: number, pageSize: number, now = new Date()) {
    const today = startOfUtcDay(now);
    const where: Prisma.PaymentWhereInput = { officeId, status: 'PENDING', dueDate: { lt: today } };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { value: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contract: { select: { id: true, number: true, client: { select: { name: true } }, responsible: { select: { name: true } } } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    const data: DelinquencyRow[] = rows.map((p) => ({
      paymentId: p.id,
      clientName: p.contract.client.name,
      contractId: p.contract.id,
      contractNumber: p.contract.number,
      installment: `${p.installmentNumber}/${p.installmentTotal}`,
      value: p.value.toNumber(),
      dueDate: p.dueDate.toISOString(),
      daysOverdue: Math.max(0, -daysUntil(p.dueDate, today)),
      responsibleName: p.contract.responsible.name,
    }));
    return { data, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  /**
   * CSV (UTF-8 com BOM, separador `;`, decimal com vírgula — abre direto no Excel pt-BR). Gerado em
   * streaming com paginação por cursor: nunca carrega todos os registros em memória.
   */
  exportCsv(officeId: string, filters: ExportFilters, now = new Date()): Readable {
    const today = startOfUtcDay(now);
    const prisma = this.prisma;
    const toExclusive = addUtcDays(filters.range.to, 1);

    async function* generate() {
      yield '\uFEFF' + ['Cliente', 'Contrato', 'Parcela', 'Vencimento', 'Valor (R$)', 'Status', 'Pago em', 'Método', 'Dias em atraso', 'Responsável'].join(';') + '\r\n';

      // 'overdue': só PENDING com vencimento anterior a hoje; 'all': tudo exceto cancelado.
      const upper = filters.scope === 'overdue' && today < toExclusive ? today : toExclusive;
      const where: Prisma.PaymentWhereInput = {
        officeId,
        dueDate: { gte: filters.range.from, lt: upper },
        ...(filters.scope === 'overdue' ? { status: 'PENDING' } : { status: { not: 'CANCELLED' } }),
      };
      let cursor: string | undefined;
      for (;;) {
        const batch = await prisma.payment.findMany({
          where,
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
          take: EXPORT_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: {
            contract: { select: { number: true, client: { select: { name: true } }, responsible: { select: { name: true } } } },
          },
        });
        if (batch.length === 0) break;
        let chunk = '';
        for (const p of batch) {
          const display = derivePaymentDisplayStatus(p.status, p.dueDate, now);
          const overdueDays = p.status === 'PENDING' ? Math.max(0, -daysUntil(p.dueDate, today)) : 0;
          chunk +=
            [
              csvCell(p.contract.client.name),
              csvCell(`#${p.contract.number}`),
              csvCell(`${p.installmentNumber}/${p.installmentTotal}`),
              csvCell(p.dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })),
              csvCell(formatMoneyPtBr(Math.round(p.value.mul(100).toNumber()))),
              csvCell(STATUS_DISTRIBUTION_META[display]?.label ?? display),
              csvCell(p.paidAt ? p.paidAt.toLocaleDateString('pt-BR', { timeZone: REPORT_TIMEZONE }) : ''),
              csvCell(p.method ? PAYMENT_METHOD_TO_API(p.method) : ''),
              csvCell(overdueDays),
              csvCell(p.contract.responsible.name),
            ].join(';') + '\r\n';
        }
        yield chunk;
        const last = batch[batch.length - 1];
        if (batch.length < EXPORT_BATCH || !last) break;
        cursor = last.id;
      }
    }
    return Readable.from(generate(), { objectMode: false });
  }
}
