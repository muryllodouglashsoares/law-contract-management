import { Prisma, type PrismaClient, type User, type UserRole } from '@prisma/client';

import { comparePassword } from '../../shared/auth/password';
import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { AuthenticationError, AuthorizationError, ConflictError, ValidationError } from '../../shared/errors';
import {
  BACKUP_CODE_COUNT,
  CHALLENGE_TTL_SECONDS,
  buildOtpauthUri,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  looksLikeBackupCode,
  signLoginChallenge,
  totpStep,
  verifyLoginChallenge,
  verifyTotp,
} from '../../shared/security/two-factor';

export const TWO_FACTOR_ROLES: UserRole[] = ['ADMIN', 'LAWYER'];
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 5;

const INVALID_CODE_MESSAGE = 'Código inválido ou expirado';

type PrismaDeps = Pick<PrismaClient, 'user' | 'userTwoFactor' | 'userBackupCode' | 'auditLog' | '$transaction'>;

export interface TwoFactorServiceConfig {
  /** null = 2FA indisponível (produção sem TWO_FACTOR_ENCRYPTION_KEY). */
  masterKey: Buffer | null;
  jwtSecret: string;
  issuer: string;
}

export interface TwoFactorActor {
  userId: string;
  officeId: string;
  role: UserRole;
}

/**
 * 2FA (TOTP) para ADMIN e LAWYER. O backend é a única fonte da verdade:
 *  - o segredo TOTP é gerado aqui, guardado CRIPTOGRAFADO e nunca mais devolvido depois do setup;
 *  - a ativação só acontece após um código válido (gerar o segredo não ativa nada);
 *  - o login em duas etapas usa um challenge assinado e curto — que NÃO é um JWT e não autentica API;
 *  - códigos TOTP não podem ser reutilizados (replay) e há bloqueio temporário após falhas seguidas;
 *  - códigos de recuperação são de uso único e guardados somente como HMAC.
 */
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly config: TwoFactorServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get available(): boolean {
    return this.config.masterKey !== null;
  }

  private key(): Buffer {
    if (!this.config.masterKey) {
      throw new ConflictError('A autenticação em dois fatores não está disponível neste servidor (chave de criptografia não configurada).');
    }
    return this.config.masterKey;
  }

  // -------------------------------------------------------------------
  // Configuração (usuário autenticado)
  // -------------------------------------------------------------------

  async status(actor: TwoFactorActor) {
    const record = await this.prisma.userTwoFactor.findUnique({ where: { userId: actor.userId } });
    const remaining = record?.enabled
      ? await this.prisma.userBackupCode.count({ where: { userId: actor.userId, usedAt: null } })
      : 0;
    return {
      available: this.available,
      eligible: TWO_FACTOR_ROLES.includes(actor.role),
      enabled: record?.enabled ?? false,
      enabledAt: record?.enabled ? record.enabledAt : null,
      backupCodesRemaining: remaining,
    };
  }

  /** Inicia a configuração. O segredo só é devolvido AQUI (para o QR Code / digitação manual). */
  async setup(actor: TwoFactorActor, accountName: string) {
    this.assertEligible(actor);
    const key = this.key();

    const existing = await this.prisma.userTwoFactor.findUnique({ where: { userId: actor.userId } });
    if (existing?.enabled) throw new ConflictError('A autenticação em dois fatores já está ativa');

    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, key);
    await this.prisma.userTwoFactor.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, secretEncrypted, enabled: false },
      // Refazer o setup antes de confirmar substitui o segredo pendente.
      update: { secretEncrypted, enabled: false, enabledAt: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null },
    });

    return { secret, otpauthUri: buildOtpauthUri({ secretBase32: secret, accountName, issuer: this.config.issuer }) };
  }

  /** Confirma com um código válido, ativa o 2FA e devolve os códigos de recuperação (única exibição). */
  async verifySetup(actor: TwoFactorActor, code: string): Promise<{ backupCodes: string[] }> {
    this.assertEligible(actor);
    const key = this.key();

    const record = await this.prisma.userTwoFactor.findUnique({ where: { userId: actor.userId } });
    if (!record || record.enabled) throw new ConflictError('Inicie a configuração do 2FA antes de confirmar o código');

    const check = verifyTotp(decryptSecret(record.secretEncrypted, key), code, this.now(), null);
    if (!check.valid) {
      throw new ValidationError(INVALID_CODE_MESSAGE, [{ path: 'code', message: INVALID_CODE_MESSAGE }]);
    }

    const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const activated = await tx.userTwoFactor.updateMany({
        where: { userId: actor.userId, enabled: false },
        data: { enabled: true, enabledAt: this.now(), lastUsedStep: BigInt(check.step), failedAttempts: 0, lockedUntil: null },
      });
      if (activated.count !== 1) throw new ConflictError('O 2FA já foi ativado');

      await tx.userBackupCode.deleteMany({ where: { userId: actor.userId } });
      await tx.userBackupCode.createMany({
        data: backupCodes.map((backupCode) => ({ userId: actor.userId, codeHash: hashBackupCode(backupCode, key) })),
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
        entityType: 'User',
        entityId: actor.userId,
        entityLabel: user.name,
      });
    });

    return { backupCodes };
  }

  /** Desativar exige a senha atual E um código TOTP atual. */
  async disable(actor: TwoFactorActor, input: { password: string; code: string }): Promise<void> {
    const key = this.key();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const record = await this.prisma.userTwoFactor.findUnique({ where: { userId: actor.userId } });
    if (!record?.enabled) throw new ConflictError('A autenticação em dois fatores não está ativa');

    this.assertNotLocked(record.lockedUntil);

    // Mesma mensagem para senha ou código incorretos (400, e não 401: a sessão continua válida).
    const passwordOk = await comparePassword(input.password, user.passwordHash);
    const check = verifyTotp(decryptSecret(record.secretEncrypted, key), input.code, this.now(), record.lastUsedStep === null ? null : Number(record.lastUsedStep));
    if (!passwordOk || !check.valid) {
      await this.registerFailure(actor.userId);
      throw new ValidationError('Senha ou código incorretos', [{ path: 'code', message: 'Senha ou código incorretos' }]);
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userBackupCode.deleteMany({ where: { userId: actor.userId } });
      await tx.userTwoFactor.delete({ where: { userId: actor.userId } });
      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
        entityType: 'User',
        entityId: actor.userId,
        entityLabel: user.name,
      });
    });
  }

  // -------------------------------------------------------------------
  // Login em duas etapas
  // -------------------------------------------------------------------

  async isEnabledFor(userId: string): Promise<boolean> {
    const record = await this.prisma.userTwoFactor.findUnique({ where: { userId }, select: { enabled: true } });
    return record?.enabled === true;
  }

  /** Challenge curto, assinado pelo servidor. NÃO concede acesso a nenhuma rota protegida. */
  issueChallenge(user: Pick<User, 'id' | 'officeId'>): { challengeToken: string; expiresInSeconds: number } {
    if (!this.available) {
      throw new AuthenticationError('A autenticação em dois fatores está indisponível. Contate o administrador.');
    }
    return {
      challengeToken: signLoginChallenge({ userId: user.id, officeId: user.officeId }, this.config.jwtSecret, this.now()),
      expiresInSeconds: CHALLENGE_TTL_SECONDS,
    };
  }

  /** Valida challenge + código (TOTP ou código de recuperação) e devolve o usuário para emitir o JWT. */
  async verifyLogin(challengeToken: string, code: string): Promise<User> {
    const payload = verifyLoginChallenge(challengeToken, this.config.jwtSecret, this.now());
    if (!payload) throw new AuthenticationError('Sessão de verificação expirada. Faça login novamente.');
    const key = this.key();

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== 'ACTIVE' || user.officeId !== payload.officeId) {
      throw new AuthenticationError('Sessão de verificação expirada. Faça login novamente.');
    }

    const record = await this.prisma.userTwoFactor.findUnique({ where: { userId: user.id } });
    if (!record?.enabled) throw new AuthenticationError('Sessão de verificação expirada. Faça login novamente.');
    this.assertNotLocked(record.lockedUntil);

    const accepted = looksLikeBackupCode(code)
      ? await this.consumeBackupCode(user.id, code, key)
      : await this.consumeTotp(record, decryptSecret(record.secretEncrypted, key), code);

    if (!accepted) {
      await this.registerFailure(user.id);
      throw new AuthenticationError(INVALID_CODE_MESSAGE);
    }

    await this.prisma.userTwoFactor.update({ where: { userId: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
    return user;
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /** Aceita o TOTP e "queima" o passo com UPDATE condicional: o mesmo código nunca vale duas vezes. */
  private async consumeTotp(record: { userId: string; lastUsedStep: bigint | null }, secret: string, code: string): Promise<boolean> {
    const last = record.lastUsedStep === null ? null : Number(record.lastUsedStep);
    const check = verifyTotp(secret, code, this.now(), last);
    if (!check.valid) return false;
    const claimed = await this.prisma.userTwoFactor.updateMany({
      where: {
        userId: record.userId,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(check.step) } }],
      },
      data: { lastUsedStep: BigInt(check.step) },
    });
    return claimed.count === 1;
  }

  /** Uso único atômico: UPDATE ... WHERE usedAt IS NULL. */
  private async consumeBackupCode(userId: string, code: string, key: Buffer): Promise<boolean> {
    const claimed = await this.prisma.userBackupCode.updateMany({
      where: { userId, codeHash: hashBackupCode(code, key), usedAt: null },
      data: { usedAt: this.now() },
    });
    return claimed.count === 1;
  }

  private async registerFailure(userId: string): Promise<void> {
    const updated = await this.prisma.userTwoFactor.update({
      where: { userId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    if (updated.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.userTwoFactor.update({
        where: { userId },
        data: { failedAttempts: 0, lockedUntil: new Date(this.now().getTime() + LOCKOUT_MINUTES * 60_000) },
      });
    }
  }

  private assertNotLocked(lockedUntil: Date | null): void {
    if (lockedUntil && lockedUntil.getTime() > this.now().getTime()) {
      throw new AuthenticationError('Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.');
    }
  }

  private assertEligible(actor: TwoFactorActor): void {
    if (!TWO_FACTOR_ROLES.includes(actor.role)) {
      throw new AuthorizationError('A autenticação em dois fatores está disponível apenas para administradores e advogados');
    }
  }
}

export { totpStep };
