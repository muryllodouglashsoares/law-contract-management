import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SEED_PASSWORD_MIN_LENGTH,
  SeedBlockedError,
  SeedConfigError,
  assertSeedAllowed,
  isProductionEnv,
  resolveSeedCredentials,
} from '../../prisma/seed-guard';

describe('seed-guard — bloqueio em produção', () => {
  it('lança SeedBlockedError quando NODE_ENV=production (ignora caixa e espaços)', () => {
    for (const value of ['production', 'PRODUCTION', ' Production ']) {
      expect(() => assertSeedAllowed({ NODE_ENV: value })).toThrow(SeedBlockedError);
    }
  });

  it('a mensagem deixa explícito que o seed de desenvolvimento não roda em produção', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/produção/);
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/Nenhuma operação foi feita no banco/);
  });

  it('permite development, test e NODE_ENV ausente (E2E/dev local)', () => {
    for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, {}]) {
      expect(() => assertSeedAllowed(env)).not.toThrow();
      expect(isProductionEnv(env)).toBe(false);
    }
  });
});

describe('seed-guard — credenciais vindas do ambiente', () => {
  it('SEED_PASSWORD vale para os três usuários', () => {
    expect(resolveSeedCredentials({ SEED_PASSWORD: 'dev-only-pass-1' })).toEqual({
      admin: 'dev-only-pass-1',
      lawyer: 'dev-only-pass-1',
      assistant: 'dev-only-pass-1',
    });
  });

  it('variáveis por usuário têm prioridade sobre SEED_PASSWORD', () => {
    expect(
      resolveSeedCredentials({
        SEED_PASSWORD: 'shared-dev-pass',
        SEED_ADMIN_PASSWORD: 'admin-dev-pass',
        SEED_LAWYER_PASSWORD: 'lawyer-dev-pass',
      }),
    ).toEqual({ admin: 'admin-dev-pass', lawyer: 'lawyer-dev-pass', assistant: 'shared-dev-pass' });
  });

  it('funciona só com as três variáveis específicas, sem SEED_PASSWORD', () => {
    expect(
      resolveSeedCredentials({
        SEED_ADMIN_PASSWORD: 'admin-dev-pass',
        SEED_LAWYER_PASSWORD: 'lawyer-dev-pass',
        SEED_ASSISTANT_PASSWORD: 'assistant-dev-pass',
      }),
    ).toEqual({ admin: 'admin-dev-pass', lawyer: 'lawyer-dev-pass', assistant: 'assistant-dev-pass' });
  });

  it('sem nenhuma senha definida: erro orientando quais variáveis configurar (não existe senha padrão)', () => {
    expect(() => resolveSeedCredentials({})).toThrow(SeedConfigError);
    expect(() => resolveSeedCredentials({})).toThrow(/SEED_PASSWORD/);
    // Valor vazio (ex.: `SEED_PASSWORD=` copiado do .env.example) conta como ausente.
    expect(() => resolveSeedCredentials({ SEED_PASSWORD: '   ' })).toThrow(SeedConfigError);
  });

  it('apontar só quais usuários ficaram sem senha', () => {
    expect(() => resolveSeedCredentials({ SEED_ADMIN_PASSWORD: 'admin-dev-pass' })).toThrow(
      /SEED_LAWYER_PASSWORD, SEED_ASSISTANT_PASSWORD/,
    );
  });

  it('rejeita senha curta sem vazar o valor na mensagem', () => {
    const short = 'x'.repeat(SEED_PASSWORD_MIN_LENGTH - 1);
    let message = '';
    try {
      resolveSeedCredentials({ SEED_PASSWORD: short });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/pelo menos/);
    expect(message).not.toContain(short);
  });
});

describe('prisma/seed.ts — bloqueio de ponta a ponta', () => {
  it('NODE_ENV=production encerra com erro ANTES de qualquer acesso ao banco', () => {
    const tsx = path.resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    const result = spawnSync(tsx, ['prisma/seed.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 60_000,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Porta inexistente: se o seed tentasse falar com o banco, a saída traria erro do Prisma.
        DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/never?schema=public',
        SEED_PASSWORD: 'dev-only-seed-password',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Seed bloqueado');
    expect(result.stderr).toContain('NODE_ENV=production');
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Iniciando seed|PrismaClient|ECONNREFUSED|Can't reach database/);
  }, 90_000);
});
