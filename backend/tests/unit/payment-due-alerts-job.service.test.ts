import { describe, expect, it, vi } from 'vitest';

import {
  PaymentDueAlertsJobService,
  buildPaymentAlertDescription,
  buildPaymentAlertPushBody,
} from '../../src/modules/payments/payment-due-alerts-job.service';

const NOW = new Date('2026-10-07T11:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2026, 9, 7 + offset));

interface FakePayment {
  id: string;
  officeId: string;
  installmentNumber: number;
  installmentTotal: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  dueDate: Date;
  contractStatus?: string;
  contract: { id: string; number: number; responsibleId: string };
}

function payment(id: string, dueOffset: number, overrides: Partial<FakePayment> = {}): FakePayment {
  return {
    id,
    officeId: 'office-1',
    installmentNumber: 2,
    installmentTotal: 6,
    status: 'PENDING',
    dueDate: day(dueOffset),
    contract: { id: 'c-1', number: 123, responsibleId: 'lawyer-1' },
    ...overrides,
  };
}

/** Banco falso: interpreta o `where` usado pelo job e mantém a tabela payment_alert_events com UNIQUE (paymentId,type). */
function makeFake(payments: FakePayment[], opts: { dispatcher?: boolean } = {}) {
  const events = new Set<string>();
  const notifications: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];

  const inRange = (date: Date, range: { gte: Date; lt: Date }) => date >= range.gte && date < range.lt;
  const findMany = vi.fn(async ({ where, take, cursor, skip }: any) => {
    let rows = payments
      .filter((p) => p.status === where.status && inRange(p.dueDate, where.dueDate) && p.contractStatus !== 'CANCELADO')
      .sort((a, b) => a.id.localeCompare(b.id));
    if (cursor) rows = rows.slice(rows.findIndex((r) => r.id === cursor.id) + (skip ?? 0));
    return rows.slice(0, take);
  });
  const tx = {
    payment: { findFirst: vi.fn(async ({ where }: any) => (payments.find((p) => p.id === where.id && p.status === where.status) ? { id: where.id } : null)) },
    paymentAlertEvent: {
      createMany: vi.fn(async ({ data }: any) => {
        let count = 0;
        for (const row of data) {
          const key = `${row.paymentId}:${row.type}`;
          if (!events.has(key)) {
            events.add(key);
            count += 1;
          }
        }
        return { count };
      }),
    },
    notification: { create: vi.fn(async ({ data }: any) => void notifications.push(data)) },
    auditLog: { create: vi.fn(async ({ data }: any) => void audits.push(data)) },
  };
  const prisma = {
    payment: { findMany },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  } as any;
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const service = new PaymentDueAlertsJobService(prisma, opts.dispatcher === false ? undefined : ({ dispatch } as any));
  return { service, findMany, notifications, audits, dispatch, events, tx };
}

describe('PaymentDueAlertsJobService', () => {
  it('alerta 3 dias antes do vencimento', async () => {
    const { service, notifications, dispatch } = makeFake([payment('p1', 3)]);
    const result = await service.run(NOW);

    expect(result).toMatchObject({ processed: 1, notified: 1, skipped: 0, enabled: true });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      officeId: 'office-1',
      userId: 'lawyer-1',
      title: 'Pagamento próximo do vencimento',
      description: 'A parcela 2/6 do contrato #123 vence em 3 dias.',
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ pushEvent: 'PAYMENT_DUE_SOON', responsibleId: 'lawyer-1' });
  });

  it('alerta no dia do vencimento', async () => {
    const { service, notifications, dispatch } = makeFake([payment('p1', 0)]);
    await service.run(NOW);

    expect(notifications[0]).toMatchObject({ title: 'Pagamento vence hoje', description: 'A parcela 2/6 do contrato #123 vence hoje.', priority: true });
    expect(dispatch.mock.calls[0]?.[0].pushEvent).toBe('PAYMENT_DUE_TODAY');
  });

  it('alerta 1 dia depois do vencimento (atraso)', async () => {
    const { service, notifications, dispatch } = makeFake([payment('p1', -1)]);
    await service.run(NOW);

    expect(notifications[0]).toMatchObject({ title: 'Pagamento em atraso', description: 'A parcela 2/6 do contrato #123 está em atraso há 1 dia.' });
    expect(dispatch.mock.calls[0]?.[0].pushEvent).toBe('PAYMENT_OVERDUE');
  });

  it('não alerta parcelas fora das três datas (ex.: +2, +4, -2 dias)', async () => {
    const { service, notifications } = makeFake([payment('a', 2), payment('b', 4), payment('c', -2)]);
    const result = await service.run(NOW);
    expect(result.processed).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  it('nunca alerta parcela PAGA nem CANCELADA', async () => {
    const { service, notifications, findMany } = makeFake([
      payment('paid', 0, { status: 'PAID' }),
      payment('cancelled', 3, { status: 'CANCELLED' }),
    ]);
    const result = await service.run(NOW);
    expect(result).toMatchObject({ processed: 0, notified: 0 });
    expect(notifications).toHaveLength(0);
    // a consulta já filtra por PENDING (não depende só do filtro em memória)
    expect(findMany.mock.calls.every((call) => call[0].where.status === 'PENDING')).toBe(true);
  });

  it('não alerta parcela de contrato cancelado', async () => {
    const { service } = makeFake([payment('p1', 0, { contractStatus: 'CANCELADO' })]);
    expect((await service.run(NOW)).processed).toBe(0);
  });

  it('execução duplicada não repete notificação, auditoria nem push', async () => {
    const { service, notifications, audits, dispatch } = makeFake([payment('p1', 0)]);
    const first = await service.run(NOW);
    const second = await service.run(NOW);

    expect(first.notified).toBe(1);
    expect(second).toMatchObject({ processed: 1, notified: 0, skipped: 1 });
    expect(notifications).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('execuções concorrentes: só uma reivindica o alerta (UNIQUE no banco)', async () => {
    const { service, notifications, dispatch } = makeFake([payment('p1', 3), payment('p2', 0), payment('p3', -1)]);
    const results = await Promise.all([service.run(NOW), service.run(NOW), service.run(NOW)]);

    expect(results.reduce((sum, r) => sum + r.notified, 0)).toBe(3);
    expect(notifications).toHaveLength(3);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it('se a parcela foi paga entre a leitura e a reivindicação, não alerta', async () => {
    const rows = [payment('p1', 0)];
    const { service, notifications, findMany } = makeFake(rows);
    findMany.mockImplementationOnce(async () => {
      const snapshot = [...rows];
      rows[0]!.status = 'PAID';
      return snapshot;
    });
    const result = await service.run(NOW);
    expect(result.notified).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  it('registra auditoria com SYSTEM_ACTOR_LABEL e sem valores financeiros', async () => {
    const { service, audits } = makeFake([payment('p1', 0)]);
    await service.run(NOW);
    expect(audits[0]).toMatchObject({ actorId: null, actorLabel: 'Sistema', entityType: 'Payment', entityLabel: 'Parcela 2/6 do contrato #123' });
  });

  it('funciona sem dispatcher (Web Push/e-mail desativados)', async () => {
    const { service, notifications } = makeFake([payment('p1', 0)], { dispatcher: false });
    const result = await service.run(NOW);
    expect(result.notified).toBe(1);
    expect(notifications).toHaveLength(1);
  });

  it('desabilitado por configuração: não processa nada', async () => {
    const service = new PaymentDueAlertsJobService({} as any, undefined, false);
    expect(await service.run(NOW)).toEqual({ processed: 0, notified: 0, skipped: 0, enabled: false });
  });

  it('o push contém só o número do contrato (sem valores, cliente ou CPF)', () => {
    for (const type of ['BEFORE_3_DAYS', 'DUE_TODAY', 'AFTER_1_DAY'] as const) {
      const body = buildPaymentAlertPushBody(type, 123);
      expect(body).toContain('#123');
      expect(body).not.toMatch(/R\$|\d{3}\.\d{3}/);
    }
    expect(buildPaymentAlertDescription('BEFORE_3_DAYS', { installment: '1/2', contractNumber: 5 })).toContain('3 dias');
  });
});
