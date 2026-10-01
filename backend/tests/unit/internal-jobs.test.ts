import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app';

// Sem banco: o job é substituído por um fake injetado via buildApp.
vi.mock('../../src/shared/database/prisma', () => ({ prisma: {} }));

const SECRET = 'a'.repeat(40);
const URL = '/internal/jobs/contract-renewal-alerts';

describe('POST /internal/jobs/contract-renewal-alerts', () => {
  let app: FastifyInstance;
  const run = vi.fn().mockResolvedValue({ processed: 12, notified: 4, skipped: 8 });

  async function setup(cronSecret: string | undefined = SECRET) {
    run.mockClear();
    app = buildApp({ cronSecret, renewalJob: { run } });
    await app.ready();
  }

  afterEach(async () => {
    await app.close();
  });

  it('segredo correto → 200 com apenas as contagens', async () => {
    await setup();
    const response = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${SECRET}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', processed: 12, notified: 4, skipped: 8 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('segredo incorreto → 401 e o job NÃO roda', async () => {
    await setup();
    const response = await app.inject({ method: 'POST', url: URL, headers: { authorization: 'Bearer outro-segredo' } });

    expect(response.statusCode).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(response.body).not.toContain(SECRET);
  });

  it('sem header / esquema errado → 401', async () => {
    await setup();
    expect((await app.inject({ method: 'POST', url: URL })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: URL, headers: { authorization: `Basic ${SECRET}` } })).statusCode).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('JWT de usuário não substitui o segredo', async () => {
    await setup();
    const jwt = app.jwt.sign({ userId: 'u', officeId: 'o', role: 'ADMIN' });
    const response = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${jwt}` } });
    expect(response.statusCode).toBe(401);
  });

  it('método incorreto (GET) → 404, sem executar o job', async () => {
    await setup();
    const response = await app.inject({ method: 'GET', url: URL, headers: { authorization: `Bearer ${SECRET}` } });
    expect(response.statusCode).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it('CRON_SECRET não configurado → endpoint desabilitado (404), mesmo com header', async () => {
    await setup('');
    const response = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${SECRET}` } });
    expect(response.statusCode).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });
});
