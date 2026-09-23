import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('responde 200 com status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/db confirma a conectividade com o banco', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/db' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
  });
});
