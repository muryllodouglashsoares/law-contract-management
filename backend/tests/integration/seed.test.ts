import { spawnSync } from 'node:child_process';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { resetDatabase } from './helpers/db';

// Senhas descartáveis só deste teste: vêm do ambiente, exatamente como no uso real do seed.
const SEED_ENV = {
  SEED_ADMIN_PASSWORD: 'seed-test-admin-pass-1',
  SEED_LAWYER_PASSWORD: 'seed-test-lawyer-pass-2',
  SEED_ASSISTANT_PASSWORD: 'seed-test-assistant-pass-3',
} as const;

const SEEDED = [
  { email: 'muryllo@escritorio.com.br', password: SEED_ENV.SEED_ADMIN_PASSWORD, role: 'ADMIN' },
  { email: 'advogado@escritorio.com.br', password: SEED_ENV.SEED_LAWYER_PASSWORD, role: 'LAWYER' },
  { email: 'assistente@escritorio.com.br', password: SEED_ENV.SEED_ASSISTANT_PASSWORD, role: 'ASSISTANT' },
] as const;

function runSeed(nodeEnv: string) {
  const tsx = path.resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  return spawnSync(tsx, ['prisma/seed.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
    shell: process.platform === 'win32',
    env: { ...process.env, ...SEED_ENV, SEED_PASSWORD: '', NODE_ENV: nodeEnv },
  });
}

describe('prisma/seed.ts — ambiente de teste', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase();
    const result = runSeed('test');
    expect(result.status, `seed falhou: ${result.stderr}`).toBe(0);
    app = buildApp();
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  async function login(email: string, password: string) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  }

  it('as credenciais definidas por variável de ambiente funcionam para os 3 usuários', async () => {
    for (const user of SEEDED) {
      const response = await login(user.email, user.password);
      expect(response.statusCode, `login de ${user.email}`).toBe(200);
      expect(response.json().accessToken).toEqual(expect.any(String));
    }
  });

  it('cada usuário tem a SUA senha (a senha de outro papel não autentica)', async () => {
    const response = await login(SEEDED[0].email, SEEDED[1].password);
    expect(response.statusCode).toBe(401);
  });

  it('nenhuma senha em texto puro é persistida: só hash bcrypt', async () => {
    const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
    expect(users).toHaveLength(3);

    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    }

    // Varre as linhas inteiras (todas as colunas) procurando qualquer uma das senhas em claro.
    const dump = JSON.stringify({
      users,
      offices: await prisma.office.findMany(),
      notifications: await prisma.notification.findMany(),
      auditLogs: await prisma.auditLog.findMany(),
    });
    for (const plain of Object.values(SEED_ENV)) {
      expect(dump).not.toContain(plain);
    }
  });

  it('preserva o fluxo mustChangePassword: usuários do seed não exigem troca de senha', async () => {
    const users = await prisma.user.findMany();
    expect(users.every((user) => user.mustChangePassword === false)).toBe(true);
  });
});

describe('prisma/seed.ts — produção', () => {
  it('NODE_ENV=production não altera o banco', async () => {
    await resetDatabase();
    const result = runSeed('production');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Seed bloqueado');
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.office.count()).toBe(0);
    await prisma.$disconnect();
  }, 180_000);
});
