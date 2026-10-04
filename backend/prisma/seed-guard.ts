/**
 * Proteções do seed de desenvolvimento (prisma/seed.ts).
 *
 * Mantido em um módulo SEM efeitos colaterais (nada de PrismaClient/rede) para que:
 *  - o seed possa validar o ambiente ANTES de abrir qualquer conexão com o banco;
 *  - os testes importem estas funções sem executar o seed.
 *
 * O seed existe só para desenvolvimento/E2E. Ele nunca cria usuários de produção e as senhas
 * dos usuários de exemplo vêm do ambiente — não há nenhuma senha fixa no código.
 */

export class SeedBlockedError extends Error {
  constructor() {
    super(
      'Seed bloqueado: NODE_ENV=production. O seed é de DESENVOLVIMENTO/TESTE e nunca deve ser executado ' +
        'em produção (ele cria usuários de exemplo). Nenhuma operação foi feita no banco.',
    );
    this.name = 'SeedBlockedError';
  }
}

export class SeedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedConfigError';
  }
}

/** Mesmo mínimo exigido pelo fluxo de troca de senha (PATCH /users/me/password). */
export const SEED_PASSWORD_MIN_LENGTH = 8;

export interface SeedCredentials {
  admin: string;
  lawyer: string;
  assistant: string;
}

type EnvLike = Record<string, string | undefined>;

export function isProductionEnv(env: EnvLike): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

/** Lança SeedBlockedError em produção. Deve ser a PRIMEIRA coisa que o seed faz. */
export function assertSeedAllowed(env: EnvLike): void {
  if (isProductionEnv(env)) throw new SeedBlockedError();
}

/**
 * Senhas dos 3 usuários de exemplo, lidas do ambiente:
 *   SEED_ADMIN_PASSWORD, SEED_LAWYER_PASSWORD, SEED_ASSISTANT_PASSWORD
 * Cada uma cai em SEED_PASSWORD (uma única senha para os três) quando não definida.
 * Os valores nunca aparecem em mensagens de erro nem em logs.
 */
export function resolveSeedCredentials(env: EnvLike): SeedCredentials {
  const shared = env.SEED_PASSWORD?.trim() || undefined;
  const pick = (specific: string): string | undefined => env[specific]?.trim() || shared;

  const resolved = {
    admin: pick('SEED_ADMIN_PASSWORD'),
    lawyer: pick('SEED_LAWYER_PASSWORD'),
    assistant: pick('SEED_ASSISTANT_PASSWORD'),
  };

  const labels: Record<keyof SeedCredentials, string> = {
    admin: 'SEED_ADMIN_PASSWORD',
    lawyer: 'SEED_LAWYER_PASSWORD',
    assistant: 'SEED_ASSISTANT_PASSWORD',
  };

  const missing = (Object.keys(labels) as (keyof SeedCredentials)[]).filter((role) => !resolved[role]);
  if (missing.length > 0) {
    throw new SeedConfigError(
      `Defina SEED_PASSWORD (uma senha para os três usuários) ou ${missing.map((r) => labels[r]).join(', ')} ` +
        'antes de rodar o seed. Use apenas senhas de desenvolvimento/teste (veja backend/.env.example).',
    );
  }

  const tooShort = (Object.keys(labels) as (keyof SeedCredentials)[]).filter(
    (role) => (resolved[role] as string).length < SEED_PASSWORD_MIN_LENGTH,
  );
  if (tooShort.length > 0) {
    throw new SeedConfigError(
      `A senha do seed deve ter pelo menos ${SEED_PASSWORD_MIN_LENGTH} caracteres ` +
        `(${tooShort.map((r) => labels[r]).join(', ')}).`,
    );
  }

  return resolved as SeedCredentials;
}
