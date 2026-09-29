import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Estes testes não tocam o banco: evita instanciar o PrismaClient real.
vi.mock('../../src/shared/database/prisma', () => ({ prisma: {} }));

describe('Security headers da API (Helmet)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function build(nodeEnv: 'test' | 'production'): Promise<FastifyInstance> {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', nodeEnv);
    const { buildApp } = await import('../../src/app');
    app = buildApp();
    await app.ready();
    return app;
  }

  it('envia nosniff e Cross-Origin-Resource-Policy: cross-origin', async () => {
    await build('test');
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('não envia HSTS fora de produção e não envia CSP na API', async () => {
    await build('test');
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).toBeUndefined();
  });

  it('envia HSTS em produção', async () => {
    await build('production');
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });

  it('CORS continua funcionando: origem permitida recebe Allow-Origin e credentials; outra não', async () => {
    await build('test');

    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight de PATCH com Authorization é aceito para a origem permitida', async () => {
    await build('test');
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/users/me',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
