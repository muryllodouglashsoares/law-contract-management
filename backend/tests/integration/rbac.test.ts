import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureClientAndTemplate, createFixtureUser, resetDatabase } from './helpers/db';

async function loginAndGetToken(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

/**
 * Testes de RBAC (requireRole) sobre as rotas restritas por papel.
 * O comportamento de requireRole em si já é coberto por
 * tests/unit/require-role.test.ts — aqui validamos a integração real:
 * rota + authenticate + requireRole + resposta HTTP.
 */
describe('RBAC nas rotas restritas por papel', () => {
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

  it('rotas públicas continuam públicas (sem token)', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x@x.com', password: 'x' } });
    expect(login.statusCode).not.toBe(403);
  });

  it('rotas autenticadas continuam exigindo JWT (401 sem token)', async () => {
    const response = await app.inject({ method: 'GET', url: '/contracts' });
    expect(response.statusCode).toBe(401);
  });

  it('ASSISTANT recebe 403 ao tentar criar um contrato', async () => {
    const assistant = await createFixtureUser({ role: 'ASSISTANT' });
    const token = await loginAndGetToken(app, assistant.email, assistant.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(assistant.officeId);

    const response = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('LAWYER consegue criar e ler contratos normalmente', async () => {
    const lawyer = await createFixtureUser({ role: 'LAWYER' });
    const token = await loginAndGetToken(app, lawyer.email, lawyer.password);
    const { clientId, templateId } = await createFixtureClientAndTemplate(lawyer.officeId);

    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto', startDate: '2026-01-01' },
    });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/contracts', headers: { authorization: `Bearer ${token}` } });
    expect(list.statusCode).toBe(200);
  });

  it('ASSISTANT ainda consegue listar contratos (leitura permanece liberada)', async () => {
    const assistant = await createFixtureUser({ role: 'ASSISTANT' });
    const token = await loginAndGetToken(app, assistant.email, assistant.password);

    const response = await app.inject({ method: 'GET', url: '/contracts', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
  });

  it('ASSISTANT recebe 403 ao tentar criar um modelo de contrato', async () => {
    const assistant = await createFixtureUser({ role: 'ASSISTANT' });
    const token = await loginAndGetToken(app, assistant.email, assistant.password);

    const response = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Modelo X', content: 'Conteúdo {{cliente.nome}}' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('LAWYER consegue criar um modelo de contrato', async () => {
    const lawyer = await createFixtureUser({ role: 'LAWYER' });
    const token = await loginAndGetToken(app, lawyer.email, lawyer.password);

    const response = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Modelo X', content: 'Conteúdo {{cliente.nome}}' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('ASSISTANT e LAWYER recebem 403 ao tentar editar dados do escritório (exclusivo de ADMIN)', async () => {
    for (const role of ['ASSISTANT', 'LAWYER'] as const) {
      const user = await createFixtureUser({ role });
      const token = await loginAndGetToken(app, user.email, user.password);

      const response = await app.inject({
        method: 'PATCH',
        url: '/offices/me',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Novo nome do escritório' },
      });

      expect(response.statusCode).toBe(403);
    }
  });

  it('ADMIN consegue editar dados do escritório', async () => {
    const admin = await createFixtureUser({ role: 'ADMIN' });
    const token = await loginAndGetToken(app, admin.email, admin.password);

    const response = await app.inject({
      method: 'PATCH',
      url: '/offices/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Novo nome do escritório' },
    });

    expect(response.statusCode).toBe(200);
  });
});
