import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureUser, resetDatabase } from './helpers/db';

// Formato real de uma PushSubscription (base64url): p256dh = 65 bytes, auth = 16 bytes.
const KEYS = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

function endpoint(id: string) {
  return `https://fcm.googleapis.com/fcm/send/${id}`;
}

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

describe('Web Push — /notifications/push', () => {
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

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('exige autenticação em todas as rotas', async () => {
    const calls = [
      { method: 'GET', url: '/notifications/push/status' },
      { method: 'POST', url: '/notifications/push/subscribe', payload: { endpoint: endpoint('a'), keys: KEYS } },
      { method: 'DELETE', url: '/notifications/push/subscribe', payload: { endpoint: endpoint('a') } },
      { method: 'POST', url: '/notifications/push/test' },
    ] as const;
    for (const call of calls) {
      const response = await app.inject(call);
      expect(response.statusCode).toBe(401);
    }
  });

  it('status devolve a chave PÚBLICA e nunca a privada', async () => {
    const user = await createFixtureUser();
    const token = await login(app, user.email, user.password);

    const response = await app.inject({ method: 'GET', url: '/notifications/push/status', headers: auth(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: true, publicKey: expect.any(String), subscriptionCount: 0 });
    expect(response.body).not.toContain('DuMcp87igLHFAEDOZ591bjNozHYPNEg8I8tLUZLapf8');
  });

  it('subscribe salva a subscription do usuário autenticado e é idempotente', async () => {
    const user = await createFixtureUser();
    const token = await login(app, user.email, user.password);
    const payload = { endpoint: endpoint('device-1'), keys: KEYS };

    for (let i = 0; i < 2; i += 1) {
      const response = await app.inject({ method: 'POST', url: '/notifications/push/subscribe', headers: auth(token), payload });
      expect(response.statusCode).toBe(204);
    }

    const rows = await prisma.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.userId, officeId: user.officeId, endpoint: payload.endpoint });
  });

  it('um usuário pode ter vários dispositivos', async () => {
    const user = await createFixtureUser();
    const token = await login(app, user.email, user.password);

    for (const id of ['pc', 'notebook']) {
      await app.inject({
        method: 'POST',
        url: '/notifications/push/subscribe',
        headers: auth(token),
        payload: { endpoint: endpoint(id), keys: KEYS },
      });
    }

    const status = await app.inject({ method: 'GET', url: '/notifications/push/status', headers: auth(token) });
    expect(status.json().subscriptionCount).toBe(2);
  });

  it('rejeita endpoints fora dos serviços de push conhecidos (anti-SSRF) e chaves inválidas', async () => {
    const user = await createFixtureUser();
    const token = await login(app, user.email, user.password);

    const ssrf = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      headers: auth(token),
      payload: { endpoint: 'https://169.254.169.254/latest/meta-data', keys: KEYS },
    });
    expect(ssrf.statusCode).toBe(400);

    const badKeys = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      headers: auth(token),
      payload: { endpoint: endpoint('x'), keys: { p256dh: 'curta', auth: 'x' } },
    });
    expect(badKeys.statusCode).toBe(400);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('DELETE remove só a subscription do próprio usuário (a de outro usuário permanece)', async () => {
    const owner = await createFixtureUser();
    const other = await createFixtureUser({ officeId: owner.officeId, role: 'LAWYER' });
    const ownerToken = await login(app, owner.email, owner.password);
    const otherToken = await login(app, other.email, other.password);

    await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      headers: auth(ownerToken),
      payload: { endpoint: endpoint('owner-device'), keys: KEYS },
    });

    // O outro usuário tenta remover a subscription do dono: 204 idempotente, mas nada é apagado.
    const attempt = await app.inject({
      method: 'DELETE',
      url: '/notifications/push/subscribe',
      headers: auth(otherToken),
      payload: { endpoint: endpoint('owner-device') },
    });
    expect(attempt.statusCode).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(1);

    const own = await app.inject({
      method: 'DELETE',
      url: '/notifications/push/subscribe',
      headers: auth(ownerToken),
      payload: { endpoint: endpoint('owner-device') },
    });
    expect(own.statusCode).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('o mesmo navegador usado por outro usuário transfere a subscription (não duplica)', async () => {
    const first = await createFixtureUser();
    const second = await createFixtureUser({ officeId: first.officeId, role: 'LAWYER' });
    const firstToken = await login(app, first.email, first.password);
    const secondToken = await login(app, second.email, second.password);
    const payload = { endpoint: endpoint('shared-browser'), keys: KEYS };

    await app.inject({ method: 'POST', url: '/notifications/push/subscribe', headers: auth(firstToken), payload });
    await app.inject({ method: 'POST', url: '/notifications/push/subscribe', headers: auth(secondToken), payload });

    const rows = await prisma.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(second.userId);
  });

  it('apagar o usuário remove as subscriptions (cascade)', async () => {
    const user = await createFixtureUser();
    await prisma.pushSubscription.create({
      data: { officeId: user.officeId, userId: user.userId, endpoint: endpoint('c'), ...{ p256dh: KEYS.p256dh, auth: KEYS.auth } },
    });
    await prisma.user.delete({ where: { id: user.userId } });
    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});
