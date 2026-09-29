import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app';

// Estes testes não tocam o banco: evita instanciar o PrismaClient real.
vi.mock('../../src/shared/database/prisma', () => ({ prisma: {} }));

/**
 * O rate limit é avaliado no onRequest, antes da validação do body. Por isso
 * estes testes usam payloads inválidos (400) e não precisam de banco de dados.
 */
describe('Rate limit de POST /auth/login', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  const login = (ip = '203.0.113.10') =>
    app.inject({ method: 'POST', url: '/auth/login', payload: {}, remoteAddress: ip });

  it('permite tentativas dentro do limite e devolve 429 na excedente', async () => {
    app = buildApp({ loginRateLimit: { max: 3, timeWindow: '1 minute' } });
    await app.ready();

    for (let i = 0; i < 3; i++) {
      expect((await login()).statusCode).toBe(400);
    }

    const blocked = await login();
    expect(blocked.statusCode).toBe(429);
  });

  it('responde 429 no formato de erro padrão, em português, com Retry-After', async () => {
    app = buildApp({ loginRateLimit: { max: 1, timeWindow: '1 minute' } });
    await app.ready();

    await login();
    const blocked = await login();

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas tentativas de login. Tente novamente em instantes.',
      },
    });
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('a resposta 429 mantém os headers de CORS (o navegador precisa conseguir ler a mensagem)', async () => {
    app = buildApp({ loginRateLimit: { max: 1, timeWindow: '1 minute' } });
    await app.ready();

    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {},
        headers: { origin: 'http://localhost:5173' },
      });
    await attempt();
    const blocked = await attempt();

    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('conta por IP: outro cliente não é afetado', async () => {
    app = buildApp({ loginRateLimit: { max: 1, timeWindow: '1 minute' } });
    await app.ready();

    await login('203.0.113.10');
    expect((await login('203.0.113.10')).statusCode).toBe(429);
    expect((await login('203.0.113.99')).statusCode).toBe(400);
  });

  it('usa o IP real do cliente atrás do proxy (X-Forwarded-For)', async () => {
    app = buildApp({ loginRateLimit: { max: 1, timeWindow: '1 minute' } });
    await app.ready();

    const viaProxy = (clientIp: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {},
        remoteAddress: '10.0.0.1',
        headers: { 'x-forwarded-for': clientIp },
      });

    await viaProxy('198.51.100.1');
    expect((await viaProxy('198.51.100.1')).statusCode).toBe(429);
    expect((await viaProxy('198.51.100.2')).statusCode).toBe(400);
  });

  it('não limita outras rotas', async () => {
    app = buildApp({ loginRateLimit: { max: 1, timeWindow: '1 minute' } });
    await app.ready();

    for (let i = 0; i < 10; i++) {
      const response = await app.inject({ method: 'GET', url: '/health', remoteAddress: '203.0.113.10' });
      expect(response.statusCode).toBe(200);
    }
    // /auth/me (mesma família de rotas) também não é limitada.
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({ method: 'GET', url: '/auth/me', remoteAddress: '203.0.113.10' });
      expect(response.statusCode).toBe(401);
    }
  });
});
