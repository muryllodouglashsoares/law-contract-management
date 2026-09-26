import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureUser, resetDatabase } from './helpers/db';

async function loginAndGetToken(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

describe('/clients', () => {
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

  it('cria um cliente e retorna os campos computados', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const response = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: 'PF',
        name: 'Maria Souza',
        document: '11144477735',
        email: 'maria@example.com',
      },
    });

    expect(response.statusCode).toBe(201);
    const { client } = response.json();
    expect(client.name).toBe('Maria Souza');
    expect(client.status).toBe('ativo');
    expect(client.contractsCount).toBe(0);
    expect(client.lastActivity).toBeTruthy();
  });

  it('rejeita e-mail inválido (400)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const response = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'PF', name: 'Maria Souza', document: '11144477735', email: 'não-é-email' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejeita documento duplicado no mesmo escritório (409)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const payload = { type: 'PF' as const, name: 'Maria Souza', document: '11144477735', email: 'maria@example.com' };

    const first = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...payload, email: 'outro@example.com' },
    });

    expect(second.statusCode).toBe(409);
  });

  it('isola clientes entre escritórios diferentes (multi-tenancy)', async () => {
    const officeA = await createFixtureUser();
    const officeB = await createFixtureUser();
    const tokenA = await loginAndGetToken(app, officeA.email, officeA.password);
    const tokenB = await loginAndGetToken(app, officeB.email, officeB.password);

    const created = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: 'PF', name: 'Cliente do Escritório A', document: '11144477735', email: 'a@example.com' },
    });
    const clientId = created.json().client.id;

    const listFromB = await app.inject({
      method: 'GET',
      url: '/clients',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(listFromB.json().data).toHaveLength(0);

    const getFromB = await app.inject({
      method: 'GET',
      url: `/clients/${clientId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(getFromB.statusCode).toBe(404);
  });

  it('atualiza um cliente existente', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const created = await app.inject({
      method: 'POST',
      url: '/clients',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'PF', name: 'Maria Souza', document: '11144477735', email: 'maria@example.com' },
    });
    const clientId = created.json().client.id;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/clients/${clientId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'inativo', phone: '11999998888' },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().client.status).toBe('inativo');
    expect(updated.json().client.phone).toBe('11999998888');
  });

  it('bloqueia remoção de cliente com contratos vinculados (409)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const client = await prisma.client.create({
      data: {
        officeId: fixture.officeId,
        type: 'PF',
        name: 'Maria Souza',
        document: '11144477735',
        email: 'maria@example.com',
      },
    });
    const template = await prisma.contractTemplate.create({
      data: { officeId: fixture.officeId, name: 'Modelo Padrão', content: 'Contrato de {{cliente.nome}}' },
    });
    await prisma.contract.create({
      data: {
        officeId: fixture.officeId,
        clientId: client.id,
        templateId: template.id,
        responsibleId: fixture.userId,
        value: 1000,
        object: 'Consultoria',
        startDate: new Date(),
      },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/clients/${client.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(409);
  });

  it('bloqueia acesso sem token (401)', async () => {
    const response = await app.inject({ method: 'GET', url: '/clients' });
    expect(response.statusCode).toBe(401);
  });
});
