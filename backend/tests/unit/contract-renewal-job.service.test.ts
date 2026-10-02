import { describe, expect, it, vi } from 'vitest';

import {
  ContractRenewalJobService,
  buildRenewalAlertDescription,
  buildRenewalPushBody,
  daysUntil,
} from '../../src/modules/contract-renewal/contract-renewal-job.service';

const NOW = new Date('2026-10-01T11:00:00.000Z');

function day(offset: number): Date {
  return new Date(Date.UTC(2026, 9, 1 + offset));
}

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    number: 102,
    officeId: 'office-1',
    responsibleId: 'user-1',
    endDate: day(27),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    renewalAlertForEndDate: null,
    client: { name: 'João da Silva' },
    ...overrides,
  };
}

function makeService(contracts: ReturnType<typeof makeContract>[], claimCount = 1, withPush = false) {
  const findMany = vi.fn().mockResolvedValueOnce(contracts).mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: claimCount });
  const notificationCreate = vi.fn().mockResolvedValue({});
  const auditCreate = vi.fn().mockResolvedValue({});
  const tx = { contract: { updateMany }, notification: { create: notificationCreate }, auditLog: { create: auditCreate } };
  const prisma = {
    contract: { findMany },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as ConstructorParameters<typeof ContractRenewalJobService>[0];
  const sendToUser = vi.fn().mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  const service = new ContractRenewalJobService(prisma, withPush ? { sendToUser } : undefined);
  return { service, findMany, updateMany, notificationCreate, auditCreate, sendToUser };
}

describe('ContractRenewalJobService (unit)', () => {
  it('consulta só ATIVO/ASSINADO dentro da janela [hoje, hoje+30d]', async () => {
    const { service, findMany } = makeService([]);
    await service.run(NOW);

    const where = findMany.mock.calls[0]?.[0].where;
    expect(where.status).toEqual({ in: ['ATIVO', 'ASSINADO'] });
    expect(where.endDate.gte).toEqual(day(0));
    expect(where.endDate.lte).toEqual(day(30));
  });

  it('notifica o responsável com tipo WARNING e mensagem com número, cliente, data e dias', async () => {
    const { service, notificationCreate, auditCreate } = makeService([makeContract()]);
    const result = await service.run(NOW);

    expect(result).toEqual({ processed: 1, notified: 1, skipped: 0 });
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    const data = notificationCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      officeId: 'office-1',
      userId: 'user-1',
      type: 'WARNING',
      title: 'Contrato próximo do vencimento',
      description: 'O contrato #102 de João da Silva termina em 28/10/2026 e está a 27 dias do vencimento.',
    });
    expect(auditCreate.mock.calls[0]?.[0].data).toMatchObject({
      actorId: null,
      actorLabel: 'Sistema',
      entityType: 'Contract',
      entityLabel: 'Contrato #102',
    });
  });

  it('pula (sem notificar) quando outra execução já reivindicou o contrato (count = 0)', async () => {
    const { service, notificationCreate } = makeService([makeContract()], 0);
    const result = await service.run(NOW);

    expect(result).toEqual({ processed: 1, notified: 0, skipped: 1 });
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('pula sem sequer abrir transação quando já foi alertado para o MESMO endDate', async () => {
    const { service, updateMany } = makeService([makeContract({ renewalAlertForEndDate: day(27) })]);
    const result = await service.run(NOW);

    expect(result).toEqual({ processed: 1, notified: 0, skipped: 1 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('endDate alterado após um alerta anterior volta a ser elegível', async () => {
    const { service, notificationCreate } = makeService([makeContract({ renewalAlertForEndDate: day(10) })]);
    const result = await service.run(NOW);

    expect(result.notified).toBe(1);
    expect(notificationCreate).toHaveBeenCalledTimes(1);
  });

  it('a reivindicação é condicional ao banco (WHERE com null OU endDate diferente) e preserva updatedAt', async () => {
    const { service, updateMany } = makeService([makeContract()]);
    await service.run(NOW);

    const call = updateMany.mock.calls[0]?.[0];
    expect(call.where.OR).toEqual([{ renewalAlertForEndDate: null }, { renewalAlertForEndDate: { not: day(27) } }]);
    expect(call.where.officeId).toBe('office-1');
    expect(call.data.renewalAlertForEndDate).toEqual(day(27));
    expect(call.data.updatedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('prioriza notificações a 7 dias ou menos', async () => {
    const { service, notificationCreate } = makeService([makeContract({ endDate: day(5) })]);
    await service.run(NOW);
    expect(notificationCreate.mock.calls[0]?.[0].data.priority).toBe(true);
  });
});

describe('ContractRenewalJobService — Web Push', () => {
  it('envia 1 push ao responsável junto com a Notification, sem nome de cliente', async () => {
    const { service, sendToUser, notificationCreate } = makeService([makeContract({ endDate: day(7) })], 1, true);
    await service.run(NOW);

    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith(
      { officeId: 'office-1', userId: 'user-1' },
      {
        type: 'CONTRACT_RENEWAL',
        title: 'Contrato próximo do vencimento',
        body: 'O contrato #102 vence em 7 dias.',
        url: '/contratos/c-1',
        tag: 'renewal:c-1',
      },
    );
    expect(JSON.stringify(sendToUser.mock.calls)).not.toContain('João');
  });

  it('NÃO envia push quando outra execução já reivindicou o contrato (count = 0)', async () => {
    const { service, sendToUser } = makeService([makeContract()], 0, true);
    await service.run(NOW);
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('NÃO envia push quando já foi alertado para o mesmo endDate (reexecução do cron)', async () => {
    const { service, sendToUser } = makeService([makeContract({ renewalAlertForEndDate: day(27) })], 1, true);
    await service.run(NOW);
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('NÃO envia push se a transação falhar (rollback)', async () => {
    const { service, sendToUser, notificationCreate } = makeService([makeContract()], 1, true);
    notificationCreate.mockRejectedValue(new Error('db error'));
    await expect(service.run(NOW)).rejects.toThrow('db error');
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('funciona normalmente sem Web Push configurado', async () => {
    const { service } = makeService([makeContract()]);
    await expect(service.run(NOW)).resolves.toEqual({ processed: 1, notified: 1, skipped: 0 });
  });

  it('buildRenewalPushBody trata hoje, 1 dia e vários dias', () => {
    expect(buildRenewalPushBody({ number: 102, days: 0 })).toBe('O contrato #102 vence hoje.');
    expect(buildRenewalPushBody({ number: 102, days: 1 })).toBe('O contrato #102 vence em 1 dia.');
    expect(buildRenewalPushBody({ number: 102, days: 7 })).toBe('O contrato #102 vence em 7 dias.');
  });
});

describe('helpers do job', () => {
  it('daysUntil conta dias-calendário UTC', () => {
    expect(daysUntil(day(0), NOW)).toBe(0);
    expect(daysUntil(day(30), NOW)).toBe(30);
    expect(daysUntil(day(-3), NOW)).toBe(-3);
  });

  it('descrição para vencimento hoje e 1 dia', () => {
    const base = { number: 7, clientName: 'Ana', endDate: day(1) };
    expect(buildRenewalAlertDescription({ ...base, days: 1 })).toContain('está a 1 dia do vencimento');
    expect(buildRenewalAlertDescription({ ...base, endDate: day(0), days: 0 })).toBe('O contrato #7 de Ana termina hoje (01/10/2026).');
  });
});
