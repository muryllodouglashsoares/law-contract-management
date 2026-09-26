import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureClientAndTemplate, createFixtureUser, resetDatabase } from './helpers/db';

async function loginAndGetToken(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

async function createContract(app: FastifyInstance, token: string, officeId: string) {
  const { clientId, templateId } = await createFixtureClientAndTemplate(officeId);
  const created = await app.inject({
    method: 'POST',
    url: '/contracts',
    headers: { authorization: `Bearer ${token}` },
    payload: { clientId, templateId, value: 5000, object: 'Objeto', startDate: '2026-01-01' },
  });
  return created.json().contract.id as string;
}

describe('/payments', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
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

  it('deriva o status "atrasado" para uma parcela pendente vencida', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const contractId = await createContract(app, token, fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        contractId,
        installmentNumber: 1,
        installmentTotal: 2,
        value: 500,
        dueDate: '2020-01-01',
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().payment.status).toBe('atrasado');
  });

  it('registra o pagamento de uma parcela e ela passa a status "pago"', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const contractId = await createContract(app, token, fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${token}` },
      payload: { contractId, installmentNumber: 1, installmentTotal: 1, value: 500, dueDate: '2030-01-01' },
    });
    const paymentId = created.json().payment.id;

    const registered = await app.inject({
      method: 'POST',
      url: `/payments/${paymentId}/register`,
      headers: { authorization: `Bearer ${token}` },
      payload: { method: 'PIX' },
    });

    expect(registered.statusCode).toBe(200);
    expect(registered.json().payment.status).toBe('pago');
    expect(registered.json().payment.method).toBe('PIX');
    expect(registered.json().payment.paidAt).toBeTruthy();
  });

  it('bloqueia registrar pagamento duas vezes (409)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const contractId = await createContract(app, token, fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${token}` },
      payload: { contractId, installmentNumber: 1, installmentTotal: 1, value: 500, dueDate: '2030-01-01' },
    });
    const paymentId = created.json().payment.id;

    await app.inject({
      method: 'POST',
      url: `/payments/${paymentId}/register`,
      headers: { authorization: `Bearer ${token}` },
      payload: { method: 'PIX' },
    });

    const secondAttempt = await app.inject({
      method: 'POST',
      url: `/payments/${paymentId}/register`,
      headers: { authorization: `Bearer ${token}` },
      payload: { method: 'PIX' },
    });

    expect(secondAttempt.statusCode).toBe(409);
  });

  it('filtra parcelas por status derivado via querystring', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const contractId = await createContract(app, token, fixture.officeId);

    await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${token}` },
      payload: { contractId, installmentNumber: 1, installmentTotal: 2, value: 500, dueDate: '2020-01-01' },
    });
    await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${token}` },
      payload: { contractId, installmentNumber: 2, installmentTotal: 2, value: 500, dueDate: '2099-01-01' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/payments?status=atrasado',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].status).toBe('atrasado');
  });
});
