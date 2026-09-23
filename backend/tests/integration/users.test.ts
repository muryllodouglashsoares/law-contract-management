import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureUser, resetDatabase } from './helpers/db';

async function loginAndGetToken(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

describe('GET/PATCH /users/me', () => {
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

  it('retorna o perfil do usuário autenticado', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const response = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(fixture.email);
  });

  it('atualiza o nome do usuário autenticado', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Nome Atualizado' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.name).toBe('Nome Atualizado');
  });

  it('rejeita corpo vazio no PATCH (400)', async () => {
    const fixture = await createFixtureUser();
    const token = await loginAndGetToken(app, fixture.email, fixture.password);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('bloqueia acesso sem token (401)', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/me' });
    expect(response.statusCode).toBe(401);
  });
});
