import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { ContractRenewalJobService } from '../../src/modules/contract-renewal/contract-renewal-job.service';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureContract, createFixtureUser, resetDatabase } from './helpers/db';

const NOW = new Date('2026-10-01T11:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset));

describe('ContractRenewalJobService (banco real)', () => {
  const job = new ContractRenewalJobService(prisma);

  beforeAll(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('contrato sem endDate e contrato distante não geram alerta', async () => {
    const f = await createFixtureUser();
    await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: null });
    await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: day(31) });

    const result = await job.run(NOW);

    expect(result).toEqual({ processed: 0, notified: 0, skipped: 0 });
    expect(await prisma.notification.count()).toBe(0);
  });

  it('contrato dentro de 30 dias gera notificação WARNING só para o responsável, com auditoria do Sistema', async () => {
    const f = await createFixtureUser({ role: 'LAWYER' });
    const other = await createFixtureUser({ officeId: f.officeId, role: 'ADMIN' });
    const c = await createFixtureContract(f.officeId, other.userId, { status: 'ATIVO', endDate: day(30), responsibleId: f.userId });

    const result = await job.run(NOW);

    expect(result).toEqual({ processed: 1, notified: 1, skipped: 0 });
    const notifications = await prisma.notification.findMany();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: f.userId, officeId: f.officeId, type: 'WARNING', title: 'Contrato próximo do vencimento' });
    expect(notifications[0]?.description).toContain(`#${c.number}`);
    expect(notifications[0]?.description).toContain('30 dias');

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: c.id } });
    expect(audit).toMatchObject({ actorId: null, actorLabel: 'Sistema', action: 'enviou alerta de renovação do' });
  });

  it('contrato vencido (endDate no passado) e status irrelevante não geram alerta', async () => {
    const f = await createFixtureUser();
    await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: day(-1) });
    await createFixtureContract(f.officeId, f.userId, { status: 'RASCUNHO', endDate: day(5) });
    await createFixtureContract(f.officeId, f.userId, { status: 'ENCERRADO', endDate: day(5) });
    await createFixtureContract(f.officeId, f.userId, { status: 'CANCELADO', endDate: day(5) });

    expect((await job.run(NOW)).notified).toBe(0);
  });

  it('execuções repetidas e CONCORRENTES não duplicam o alerta', async () => {
    const f = await createFixtureUser();
    await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: day(10) });

    const [a, b, c] = await Promise.all([job.run(NOW), job.run(NOW), job.run(NOW)]);
    expect(a.notified + b.notified + c.notified).toBe(1);

    const again = await job.run(NOW);
    expect(again).toEqual({ processed: 1, notified: 0, skipped: 1 });
    expect(await prisma.notification.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it('mudar o endDate abre um novo ciclo de alerta', async () => {
    const f = await createFixtureUser();
    const c = await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: day(10) });
    await job.run(NOW);

    await prisma.contract.update({ where: { id: c.id }, data: { endDate: day(20) } });
    const result = await job.run(NOW);

    expect(result.notified).toBe(1);
    expect(await prisma.notification.count()).toBe(2);
  });

  it('o alerta não altera updatedAt do contrato', async () => {
    const f = await createFixtureUser();
    const c = await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: day(10) });
    const before = await prisma.contract.findUniqueOrThrow({ where: { id: c.id } });
    await job.run(NOW);
    const after = await prisma.contract.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.renewalAlertForEndDate).toEqual(day(10));
  });

  it('isola escritórios: cada notificação vai para o usuário/escritório do próprio contrato', async () => {
    const a = await createFixtureUser();
    const b = await createFixtureUser();
    await createFixtureContract(a.officeId, a.userId, { status: 'ATIVO', endDate: day(5) });
    await createFixtureContract(b.officeId, b.userId, { status: 'ASSINADO', endDate: day(6) });

    await job.run(NOW);

    const forA = await prisma.notification.findMany({ where: { userId: a.userId } });
    const forB = await prisma.notification.findMany({ where: { userId: b.userId } });
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
    expect(forA[0]?.officeId).toBe(a.officeId);
    expect(forB[0]?.officeId).toBe(b.officeId);
  });
});

describe('endpoint do cron com banco real', () => {
  let app: FastifyInstance;
  const SECRET = 'segredo-de-teste-'.padEnd(40, 'x');

  beforeAll(async () => {
    app = buildApp({ cronSecret: SECRET });
    await app.ready();
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('executa o job e responde só com contagens (sem dados de contrato)', async () => {
    const f = await createFixtureUser();
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await createFixtureContract(f.officeId, f.userId, { status: 'ATIVO', endDate: new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate())) });

    const response = await app.inject({ method: 'POST', url: '/internal/jobs/contract-renewal-alerts', headers: { authorization: `Bearer ${SECRET}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', processed: 1, notified: 1, skipped: 0 });

    const second = await app.inject({ method: 'POST', url: '/internal/jobs/contract-renewal-alerts', headers: { authorization: `Bearer ${SECRET}` } });
    expect(second.json()).toMatchObject({ processed: 1, notified: 0, skipped: 1 });
  });
});
