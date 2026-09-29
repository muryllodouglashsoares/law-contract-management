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

describe('Gestão de usuários (ADMIN)', () => {
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

  const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

  async function adminSession() {
    const admin = await createFixtureUser({ role: 'ADMIN' });
    const token = await loginAndGetToken(app, admin.email, admin.password);
    return { admin, token };
  }

  const newUserPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Maria Silva',
    email: `maria-${Math.random().toString(36).slice(2)}@example.com`,
    role: 'LAWYER',
    ...overrides,
  });

  describe('autorização', () => {
    it.each(['LAWYER', 'ASSISTANT'] as const)('%s não acessa nenhuma rota de gestão (403)', async (role) => {
      const fixture = await createFixtureUser({ role });
      const token = await loginAndGetToken(app, fixture.email, fixture.password);
      const targetId = fixture.userId;

      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/users', headers: authHeader(token) }),
        app.inject({ method: 'POST', url: '/users', headers: authHeader(token), payload: newUserPayload() }),
        app.inject({ method: 'GET', url: `/users/${targetId}`, headers: authHeader(token) }),
        app.inject({ method: 'PATCH', url: `/users/${targetId}/role`, headers: authHeader(token), payload: { role: 'ADMIN' } }),
        app.inject({ method: 'PATCH', url: `/users/${targetId}/status`, headers: authHeader(token), payload: { status: 'INACTIVE' } }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(403);
      }
    });

    it('sem token → 401', async () => {
      expect((await app.inject({ method: 'GET', url: '/users' })).statusCode).toBe(401);
    });
  });

  describe('POST /users', () => {
    it('cria usuário com senha provisória (uma vez), mustChangePassword=true e sem passwordHash', async () => {
      const { admin, token } = await adminSession();

      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: authHeader(token),
        payload: newUserPayload({ oabNumber: 'OAB/SP 123456', phone: '11999999999' }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.temporaryPassword).toEqual(expect.any(String));
      expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(body.user).toMatchObject({
        role: 'LAWYER',
        status: 'ACTIVE',
        mustChangePassword: true,
        officeId: admin.officeId,
      });
      expect(body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('$2'); // nenhum hash bcrypt na resposta

      // A senha provisória nunca é devolvida de novo.
      const again = await app.inject({ method: 'GET', url: `/users/${body.user.id}`, headers: authHeader(token) });
      expect(again.statusCode).toBe(200);
      expect(JSON.stringify(again.json())).not.toContain(body.temporaryPassword);

      // No banco: só o hash.
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
      expect(stored.passwordHash).not.toBe(body.temporaryPassword);
      expect(stored.mustChangePassword).toBe(true);
    });

    it('ignora officeId do cliente: rejeita campos controlados pelo backend (400)', async () => {
      const { token } = await adminSession();
      const other = await createFixtureUser({ role: 'ADMIN' });

      for (const extra of [
        { officeId: other.officeId },
        { password: 'Senha@123' },
        { passwordHash: 'x' },
        { status: 'INACTIVE' },
        { mustChangePassword: false },
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/users',
          headers: authHeader(token),
          payload: newUserPayload(extra),
        });
        expect(response.statusCode).toBe(400);
      }
    });

    it('e-mail duplicado → 409 (inclusive de outro escritório e com caixa diferente)', async () => {
      const { token } = await adminSession();
      const other = await createFixtureUser({ role: 'LAWYER' });

      const same = await app.inject({
        method: 'POST',
        url: '/users',
        headers: authHeader(token),
        payload: newUserPayload({ email: other.email }),
      });
      expect(same.statusCode).toBe(409);
      expect(same.json().error.code).toBe('CONFLICT');

      const otherCase = await app.inject({
        method: 'POST',
        url: '/users',
        headers: authHeader(token),
        payload: newUserPayload({ email: other.email.toUpperCase() }),
      });
      expect(otherCase.statusCode).toBe(409);
    });

    it('registra auditoria USER_CREATED sem a senha', async () => {
      const { admin, token } = await adminSession();

      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: authHeader(token),
        payload: newUserPayload(),
      });
      const { user, temporaryPassword } = response.json();

      const logs = await prisma.auditLog.findMany({ where: { entityType: 'User', entityId: user.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ officeId: admin.officeId, actorId: admin.userId, action: 'criou o usuário' });
      expect(JSON.stringify(logs)).not.toContain(temporaryPassword);
    });

    it('o novo usuário entra com a senha provisória, é sinalizado para troca e a troca limpa o flag', async () => {
      const { token } = await adminSession();
      const created = (
        await app.inject({ method: 'POST', url: '/users', headers: authHeader(token), payload: newUserPayload() })
      ).json();

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: created.user.email, password: created.temporaryPassword },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().user.mustChangePassword).toBe(true);

      const newUserToken = login.json().accessToken;

      const wrong = await app.inject({
        method: 'PATCH',
        url: '/users/me/password',
        headers: authHeader(newUserToken),
        payload: { currentPassword: 'senha-errada', newPassword: 'NovaSenha@123' },
      });
      expect(wrong.statusCode).toBe(400); // não 401: a sessão continua válida
      expect((await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } })).mustChangePassword).toBe(true);

      const change = await app.inject({
        method: 'PATCH',
        url: '/users/me/password',
        headers: authHeader(newUserToken),
        payload: { currentPassword: created.temporaryPassword, newPassword: 'NovaSenha@123' },
      });
      expect(change.statusCode).toBe(204);

      const me = await app.inject({ method: 'GET', url: '/auth/me', headers: authHeader(newUserToken) });
      expect(me.json().user.mustChangePassword).toBe(false);

      const relogin = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: created.user.email, password: 'NovaSenha@123' },
      });
      expect(relogin.statusCode).toBe(200);
      expect(relogin.json().user.mustChangePassword).toBe(false);
    });
  });

  describe('GET /users e isolamento por escritório', () => {
    it('lista somente usuários do escritório da sessão, com busca e paginação', async () => {
      const { admin, token } = await adminSession();
      await createFixtureUser({ role: 'LAWYER', officeId: admin.officeId });
      const outsider = await createFixtureUser({ role: 'ADMIN' }); // outro escritório

      const list = await app.inject({ method: 'GET', url: '/users', headers: authHeader(token) });
      expect(list.statusCode).toBe(200);
      const body = list.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.every((u: { officeId: string }) => u.officeId === admin.officeId)).toBe(true);
      expect(body.data.map((u: { id: string }) => u.id)).not.toContain(outsider.userId);
      expect(body.data.every((u: { passwordHash?: string }) => u.passwordHash === undefined)).toBe(true);
      expect(body.pagination).toMatchObject({ page: 1, total: 2 });

      const search = await app.inject({
        method: 'GET',
        url: `/users?search=${encodeURIComponent(admin.email)}`,
        headers: authHeader(token),
      });
      expect(search.json().data.map((u: { id: string }) => u.id)).toEqual([admin.userId]);

      const paged = await app.inject({ method: 'GET', url: '/users?page=2&pageSize=1', headers: authHeader(token) });
      expect(paged.json().data).toHaveLength(1);
      expect(paged.json().pagination).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('officeId na query não altera o tenant', async () => {
      const { admin, token } = await adminSession();
      const outsider = await createFixtureUser({ role: 'ADMIN' });

      const response = await app.inject({
        method: 'GET',
        url: `/users?officeId=${outsider.officeId}`,
        headers: authHeader(token),
      });

      expect(response.json().data.map((u: { id: string }) => u.id)).toEqual([admin.userId]);
    });

    it('usuário de outro escritório → 404 em GET, role e status (e nada é alterado)', async () => {
      const { token } = await adminSession();
      const outsider = await createFixtureUser({ role: 'LAWYER' });

      const get = await app.inject({ method: 'GET', url: `/users/${outsider.userId}`, headers: authHeader(token) });
      const role = await app.inject({
        method: 'PATCH',
        url: `/users/${outsider.userId}/role`,
        headers: authHeader(token),
        payload: { role: 'ADMIN' },
      });
      const status = await app.inject({
        method: 'PATCH',
        url: `/users/${outsider.userId}/status`,
        headers: authHeader(token),
        payload: { status: 'INACTIVE' },
      });

      expect([get.statusCode, role.statusCode, status.statusCode]).toEqual([404, 404, 404]);
      const untouched = await prisma.user.findUniqueOrThrow({ where: { id: outsider.userId } });
      expect(untouched).toMatchObject({ role: 'LAWYER', status: 'ACTIVE' });
    });

    it('id inexistente e id de outro escritório são indistinguíveis (mesmo 404/mensagem)', async () => {
      const { token } = await adminSession();
      const outsider = await createFixtureUser({ role: 'LAWYER' });

      const foreign = await app.inject({ method: 'GET', url: `/users/${outsider.userId}`, headers: authHeader(token) });
      const missing = await app.inject({
        method: 'GET',
        url: '/users/00000000-0000-4000-8000-000000000000',
        headers: authHeader(token),
      });

      expect(foreign.statusCode).toBe(missing.statusCode);
      expect(foreign.json()).toEqual(missing.json());
    });
  });

  describe('PATCH /users/:id/role', () => {
    it('altera o papel e registra USER_ROLE_CHANGED', async () => {
      const { admin, token } = await adminSession();
      const member = await createFixtureUser({ role: 'ASSISTANT', officeId: admin.officeId });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${member.userId}/role`,
        headers: authHeader(token),
        payload: { role: 'LAWYER' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.role).toBe('LAWYER');
      const logs = await prisma.auditLog.findMany({ where: { entityId: member.userId } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ action: 'alterou o papel de', actorId: admin.userId, officeId: admin.officeId });
    });

    it('ADMIN não altera o próprio papel', async () => {
      const { admin, token } = await adminSession();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${admin.userId}/role`,
        headers: authHeader(token),
        payload: { role: 'LAWYER' },
      });

      expect(response.statusCode).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).role).toBe('ADMIN');
    });

    it('rejeita papel inválido (400)', async () => {
      const { admin, token } = await adminSession();
      const member = await createFixtureUser({ role: 'ASSISTANT', officeId: admin.officeId });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${member.userId}/role`,
        headers: authHeader(token),
        payload: { role: 'SUPERUSER' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('token antigo de quem foi rebaixado passa a valer com o papel atual (perde acesso admin)', async () => {
      const { admin, token } = await adminSession();
      const second = await createFixtureUser({ role: 'ADMIN', officeId: admin.officeId });
      const secondToken = await loginAndGetToken(app, second.email, second.password);

      await app.inject({
        method: 'PATCH',
        url: `/users/${second.userId}/role`,
        headers: authHeader(token),
        payload: { role: 'ASSISTANT' },
      });

      const response = await app.inject({ method: 'GET', url: '/users', headers: authHeader(secondToken) });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /users/:id/status', () => {
    it('desativa (registro permanece) e registra USER_STATUS_CHANGED; token antigo passa a dar 401', async () => {
      const { admin, token } = await adminSession();
      const member = await createFixtureUser({ role: 'LAWYER', officeId: admin.officeId });
      const memberToken = await loginAndGetToken(app, member.email, member.password);

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${member.userId}/status`,
        headers: authHeader(token),
        payload: { status: 'INACTIVE' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.status).toBe('INACTIVE');
      expect(await prisma.user.count({ where: { id: member.userId } })).toBe(1);

      const logs = await prisma.auditLog.findMany({ where: { entityId: member.userId } });
      expect(logs[0]).toMatchObject({ action: 'alterou o status do usuário', actorId: admin.userId });

      const withOldToken = await app.inject({ method: 'GET', url: '/clients', headers: authHeader(memberToken) });
      expect(withOldToken.statusCode).toBe(401);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: member.email, password: member.password },
      });
      expect(login.statusCode).toBe(401);
    });

    it('reativa o usuário', async () => {
      const { admin, token } = await adminSession();
      const member = await createFixtureUser({ role: 'LAWYER', status: 'INACTIVE', officeId: admin.officeId });

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${member.userId}/status`,
        headers: authHeader(token),
        payload: { status: 'ACTIVE' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.status).toBe('ACTIVE');
    });

    it('ADMIN não desativa a si próprio', async () => {
      const { admin, token } = await adminSession();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${admin.userId}/status`,
        headers: authHeader(token),
        payload: { status: 'INACTIVE' },
      });

      expect(response.statusCode).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).status).toBe('ACTIVE');
    });

    it('não há DELETE /users/:id', async () => {
      const { admin, token } = await adminSession();
      const member = await createFixtureUser({ role: 'LAWYER', officeId: admin.officeId });

      const response = await app.inject({ method: 'DELETE', url: `/users/${member.userId}`, headers: authHeader(token) });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(await prisma.user.count({ where: { id: member.userId } })).toBe(1);
    });
  });

  describe('token de usuário inexistente / de outro tenant', () => {
    it('usuário removido do banco com token válido → 401', async () => {
      const fixture = await createFixtureUser({ role: 'ADMIN' });
      const token = await loginAndGetToken(app, fixture.email, fixture.password);
      await prisma.user.delete({ where: { id: fixture.userId } });

      const response = await app.inject({ method: 'GET', url: '/users/me', headers: authHeader(token) });
      expect(response.statusCode).toBe(401);
    });
  });
});
