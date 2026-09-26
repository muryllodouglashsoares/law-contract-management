import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureClientAndTemplate, createFixtureUser, resetDatabase } from './helpers/db';

async function loginAndGetToken(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

describe('/contracts', () => {
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

  it('cria um contrato e gera a primeira versão com o template renderizado', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    const response = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clientId,
        templateId,
        value: 5000,
        object: 'Consultoria jurídica mensal',
        startDate: '2026-01-15',
        termText: '12 meses',
      },
    });

    expect(response.statusCode).toBe(201);
    const { contract } = response.json();
    expect(contract.status).toBe('rascunho');
    expect(contract.number).toEqual(expect.any(Number));
    expect(contract.value).toBe(5000);
    expect(contract.currentVersion.versionNumber).toBe(1);
    expect(contract.currentVersion.content).toContain('Cliente de Teste');
    expect(contract.currentVersion.content).not.toContain('{{');
  });

  it('rejeita cliente ou modelo de outro escritório (404)', async () => {
    const fixture = await createFixtureUser();
    const otherOffice = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(otherOffice.officeId);

    const response = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('gera uma nova versão ao editar um contrato em rascunho', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto inicial', startDate: '2026-01-01' },
    });
    const contractId = created.json().contract.id;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 2000 },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().contract.value).toBe(2000);
    expect(updated.json().contract.currentVersion.versionNumber).toBe(2);
  });

  it('bloqueia edição de contrato fora do rascunho (409)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });
    const contractId = created.json().contract.id;

    await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'enviado' },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 3000 },
    });

    expect(response.statusCode).toBe(409);
  });

  it('segue o fluxo de transições de status válidas', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });
    const contractId = created.json().contract.id;

    for (const status of ['enviado', 'assinado', 'ativo']) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/contracts/${contractId}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().contract.status).toBe(status);
    }
  });

  it('rejeita uma transição de status inválida (409)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });
    const contractId = created.json().contract.id;

    // rascunho -> ativo não é uma transição permitida (precisa passar por enviado/assinado)
    const response = await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'ativo' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('cria uma notificação para o responsável ao enviar o contrato', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });
    const contractId = created.json().contract.id;

    await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'enviado' },
    });

    const notifications = await prisma.notification.findMany({ where: { userId: fixture.userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe('Contrato enviado');
  });

  it('isola contratos entre escritórios diferentes', async () => {
    const officeA = await createFixtureUser();
    const officeB = await createFixtureUser();
    const tokenA = await loginAndGetToken(app, officeA.email, officeA.password);
    const tokenB = await loginAndGetToken(app, officeB.email, officeB.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(officeA.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });
    const contractId = created.json().contract.id;

    const response = await app.inject({
      method: 'GET',
      url: `/contracts/${contractId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
