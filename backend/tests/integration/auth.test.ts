import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureUser, resetDatabase } from './helpers/db';

describe('Auth flow (POST /auth/login, GET /auth/me)', () => {
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

  it('autentica com credenciais válidas e retorna accessToken + usuário sem passwordHash', async () => {
    const fixture = await createFixtureUser();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: fixture.email, password: fixture.password },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({ id: fixture.userId, email: fixture.email, role: 'ADMIN' });
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('rejeita login com senha incorreta (401)', async () => {
    const fixture = await createFixtureUser();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: fixture.email, password: 'senha-errada' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('rejeita login com e-mail inexistente (401)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ninguem@example.com', password: 'qualquer-coisa' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejeita body inválido com 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /auth/me retorna os dados do usuário autenticado', async () => {
    const fixture = await createFixtureUser();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: fixture.email, password: fixture.password },
    });
    const { accessToken } = loginResponse.json();

    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().user).toMatchObject({ id: fixture.userId, email: fixture.email });
  });

  it('GET /auth/me sem token retorna 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('GET /auth/me com token inválido retorna 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer token-invalido' },
    });

    expect(response.statusCode).toBe(401);
  });
});
