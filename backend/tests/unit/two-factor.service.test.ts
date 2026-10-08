import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { TwoFactorService, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from '../../src/modules/auth/two-factor.service';
import { decryptSecret, totpAt, totpStep } from '../../src/shared/security/two-factor';

const KEY = Buffer.alloc(32, 3);
const JWT = 'jwt-secret-for-two-factor-tests-123456';
let clock = new Date('2026-10-07T12:00:05Z');
const now = () => clock;

interface Row { userId: string; secretEncrypted: string; enabled: boolean; enabledAt: Date | null; lastUsedStep: bigint | null; failedAttempts: number; lockedUntil: Date | null }

async function makeFake(role: 'ADMIN' | 'LAWYER' | 'ASSISTANT' = 'ADMIN', status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  clock = new Date('2026-10-07T12:00:05Z');
  const passwordHash = await hash('Senha@123', 4);
  const user = { id: 'u1', officeId: 'o1', name: 'Ana', email: 'ana@x.com', role, status, passwordHash };
  let tf: Row | null = null;
  const backup: { userId: string; codeHash: string; usedAt: Date | null }[] = [];
  const audits: any[] = [];

  const userTwoFactor = {
    findUnique: vi.fn(async () => (tf ? { ...tf } : null)),
    upsert: vi.fn(async ({ create, update }: any) => {
      tf = tf ? { ...tf, ...update } : { enabledAt: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null, ...create };
      return tf;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (!tf || tf.userId !== where.userId) return { count: 0 };
      if (where.enabled !== undefined && tf.enabled !== where.enabled) return { count: 0 };
      if (where.OR && !where.OR.some((c: any) => (c.lastUsedStep === null ? tf!.lastUsedStep === null : tf!.lastUsedStep !== null && tf!.lastUsedStep < c.lastUsedStep.lt))) return { count: 0 };
      tf = { ...tf, ...data };
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: any) => {
      const next: any = { ...tf };
      for (const [k, v] of Object.entries<any>(data)) next[k] = v && typeof v === 'object' && 'increment' in v ? next[k] + v.increment : v;
      tf = next;
      return { ...tf };
    }),
    delete: vi.fn(async () => { tf = null; }),
  };
  const userBackupCode = {
    count: vi.fn(async ({ where }: any) => backup.filter((b) => b.userId === where.userId && b.usedAt === null).length),
    deleteMany: vi.fn(async () => { backup.length = 0; }),
    createMany: vi.fn(async ({ data }: any) => { backup.push(...data.map((d: any) => ({ ...d, usedAt: null }))); return { count: data.length }; }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = backup.find((b) => b.userId === where.userId && b.codeHash === where.codeHash && b.usedAt === null);
      if (!row) return { count: 0 };
      row.usedAt = data.usedAt;
      return { count: 1 };
    }),
  };
  const prisma: any = {
    user: { findUniqueOrThrow: vi.fn(async () => user), findUnique: vi.fn(async ({ where }: any) => (where.id === user.id ? user : null)) },
    userTwoFactor,
    userBackupCode,
    auditLog: { create: vi.fn(async ({ data }: any) => void audits.push(data)) },
  };
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma));
  const service = new TwoFactorService(prisma, { masterKey: KEY, jwtSecret: JWT, issuer: 'LexContract' }, now);
  const actor = { userId: 'u1', officeId: 'o1', role };
  const currentCode = async () => totpAt(decryptSecret(tf!.secretEncrypted, KEY), totpStep(clock));
  return { service, actor, user, backup, audits, getRow: () => tf, currentCode };
}

async function activate(f: Awaited<ReturnType<typeof makeFake>>) {
  const setup = await f.service.setup(f.actor, 'ana@x.com');
  const { backupCodes } = await f.service.verifySetup(f.actor, await f.currentCode());
  return { setup, backupCodes };
}

describe('TwoFactorService — configuração', () => {
  it.each(['ADMIN', 'LAWYER'] as const)('%s consegue configurar e ativar', async (role) => {
    const f = await makeFake(role);
    const { setup, backupCodes } = await activate(f);
    expect(setup.otpauthUri).toContain('otpauth://totp/');
    expect(backupCodes).toHaveLength(10);
    expect(f.getRow()?.enabled).toBe(true);
    expect(f.audits.at(-1)).toMatchObject({ action: 'ativou a autenticação em dois fatores', entityType: 'User' });
  });

  it('ASSISTANT não pode configurar 2FA', async () => {
    const f = await makeFake('ASSISTANT');
    await expect(f.service.setup(f.actor, 'x@x.com')).rejects.toMatchObject({ statusCode: 403 });
    expect((await f.service.status(f.actor)).eligible).toBe(false);
  });

  it('gerar o segredo NÃO ativa o 2FA; só um código válido ativa', async () => {
    const f = await makeFake();
    await f.service.setup(f.actor, 'ana@x.com');
    expect(f.getRow()?.enabled).toBe(false);
    await expect(f.service.verifySetup(f.actor, '000000')).rejects.toMatchObject({ statusCode: 400 });
    expect(f.getRow()?.enabled).toBe(false);
    expect(await f.service.isEnabledFor('u1')).toBe(false);
  });

  it('o segredo é armazenado criptografado e nunca devolvido pelo status', async () => {
    const f = await makeFake();
    const { setup } = await activate(f);
    expect(f.getRow()?.secretEncrypted).not.toContain(setup.secret);
    const status = await f.service.status(f.actor);
    expect(JSON.stringify(status)).not.toContain(setup.secret);
    expect(status).toMatchObject({ available: true, eligible: true, enabled: true, backupCodesRemaining: 10 });
  });

  it('só os HMACs dos códigos de recuperação são armazenados', async () => {
    const f = await makeFake();
    const { backupCodes } = await activate(f);
    for (const code of backupCodes) {
      expect(f.backup.some((b) => b.codeHash.includes(code.replace('-', '')))).toBe(false);
    }
    expect(f.backup).toHaveLength(10);
  });

  it('não permite iniciar setup com 2FA já ativo', async () => {
    const f = await makeFake();
    await activate(f);
    await expect(f.service.setup(f.actor, 'a@x.com')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('sem chave de criptografia (produção) o 2FA fica indisponível', async () => {
    const f = await makeFake();
    const service = new TwoFactorService({} as any, { masterKey: null, jwtSecret: JWT, issuer: 'X' }, now);
    expect(service.available).toBe(false);
    await expect(service.setup(f.actor, 'a@x.com')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('TwoFactorService — login', () => {
  it('login com TOTP válido devolve o usuário; o challenge nunca é aceito como JWT de API', async () => {
    const f = await makeFake();
    await activate(f);
    clock = new Date(clock.getTime() + 30_000); // próximo passo (o do setup já foi usado)
    const { challengeToken, expiresInSeconds } = f.service.issueChallenge(f.user);
    expect(expiresInSeconds).toBe(300);
    expect(challengeToken.split('.')).toHaveLength(2); // não tem o formato header.payload.signature de um JWT
    const user = await f.service.verifyLogin(challengeToken, await f.currentCode());
    expect(user.id).toBe('u1');
  });

  it('TOTP inválido → 401 e contador de falhas', async () => {
    const f = await makeFake();
    await activate(f);
    const { challengeToken } = f.service.issueChallenge(f.user);
    await expect(f.service.verifyLogin(challengeToken, '000000')).rejects.toMatchObject({ statusCode: 401 });
    expect(f.getRow()?.failedAttempts).toBe(1);
  });

  it('o mesmo código TOTP não pode ser usado duas vezes (replay)', async () => {
    const f = await makeFake();
    await activate(f);
    clock = new Date(clock.getTime() + 30_000);
    const { challengeToken } = f.service.issueChallenge(f.user);
    const code = await f.currentCode();
    await f.service.verifyLogin(challengeToken, code);
    await expect(f.service.verifyLogin(challengeToken, code)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('challenge expirado é rejeitado', async () => {
    const f = await makeFake();
    await activate(f);
    const { challengeToken } = f.service.issueChallenge(f.user);
    clock = new Date(clock.getTime() + 6 * 60_000);
    await expect(f.service.verifyLogin(challengeToken, await f.currentCode())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('código de recuperação funciona UMA vez só', async () => {
    const f = await makeFake();
    const { backupCodes } = await activate(f);
    const { challengeToken } = f.service.issueChallenge(f.user);
    const user = await f.service.verifyLogin(challengeToken, backupCodes[0]!);
    expect(user.id).toBe('u1');
    await expect(f.service.verifyLogin(challengeToken, backupCodes[0]!)).rejects.toMatchObject({ statusCode: 401 });
    expect((await f.service.status(f.actor)).backupCodesRemaining).toBe(9);
    // outro código continua válido
    await expect(f.service.verifyLogin(challengeToken, backupCodes[1]!.toLowerCase())).resolves.toBeTruthy();
  });

  it('usuário desativado não conclui o login', async () => {
    const f = await makeFake('ADMIN', 'INACTIVE');
    await activate(f).catch(() => undefined);
    const { challengeToken } = f.service.issueChallenge(f.user);
    await expect(f.service.verifyLogin(challengeToken, '123456')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('bloqueia temporariamente após falhas seguidas e libera depois', async () => {
    const f = await makeFake();
    await activate(f);
    const { challengeToken } = f.service.issueChallenge(f.user);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await expect(f.service.verifyLogin(challengeToken, '000000')).rejects.toMatchObject({ statusCode: 401 });
    }
    expect(f.getRow()?.lockedUntil).not.toBeNull();
    // mesmo com o código correto, enquanto bloqueado
    clock = new Date(clock.getTime() + 30_000);
    await expect(f.service.verifyLogin(challengeToken, await f.currentCode())).rejects.toMatchObject({ statusCode: 401 });
    clock = new Date(clock.getTime() + LOCKOUT_MINUTES * 60_000);
    const fresh = f.service.issueChallenge(f.user);
    await expect(f.service.verifyLogin(fresh.challengeToken, await f.currentCode())).resolves.toBeTruthy();
  });
});

describe('TwoFactorService — desativação', () => {
  it('exige senha atual E código TOTP atual', async () => {
    const f = await makeFake();
    await activate(f);
    clock = new Date(clock.getTime() + 30_000);
    await expect(f.service.disable(f.actor, { password: 'errada', code: await f.currentCode() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(f.service.disable(f.actor, { password: 'Senha@123', code: '000000' })).rejects.toMatchObject({ statusCode: 400 });
    expect(f.getRow()?.enabled).toBe(true);

    await f.service.disable(f.actor, { password: 'Senha@123', code: await f.currentCode() });
    expect(f.getRow()).toBeNull();
    expect(f.backup).toHaveLength(0);
    expect(f.audits.at(-1)).toMatchObject({ action: 'desativou a autenticação em dois fatores' });
  });

  it('auditoria nunca contém segredo, senha ou códigos', async () => {
    const f = await makeFake();
    const { setup, backupCodes } = await activate(f);
    const text = JSON.stringify(f.audits);
    expect(text).not.toContain(setup.secret);
    expect(text).not.toContain('Senha@123');
    expect(backupCodes.some((c) => text.includes(c))).toBe(false);
  });
});
