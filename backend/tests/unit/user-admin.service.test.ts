import { Prisma, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserService } from '../../src/modules/users/user.service';
import { comparePassword } from '../../src/shared/auth/password';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../../src/shared/errors';

const OFFICE = 'office-1';
const ACTOR = { userId: 'admin-1', officeId: OFFICE };

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-2',
    officeId: OFFICE,
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: null,
    oabNumber: null,
    passwordHash: 'hash',
    role: 'LAWYER',
    status: 'ACTIVE',
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UserService — gestão de usuários (ADMIN)', () => {
  const user = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const auditLog = { create: vi.fn() };
  const queryRaw = vi.fn();
  let service: UserService;

  beforeEach(() => {
    vi.resetAllMocks();
    // A transação usa o mesmo conjunto de mocks (o "tx" é o próprio client fake).
    const tx = { user, auditLog, $queryRaw: queryRaw };
    const prismaMock = {
      user,
      auditLog,
      $transaction: async (fn: (client: unknown) => unknown) => fn(tx),
    };
    service = new UserService(prismaMock as never);
  });

  describe('list', () => {
    it('filtra SEMPRE pelo officeId da sessão e busca por nome/e-mail', async () => {
      user.findMany.mockResolvedValue([]);
      user.count.mockResolvedValue(0);

      await service.list(OFFICE, { page: 2, pageSize: 10, search: 'mar' });

      const where = user.findMany.mock.calls[0]?.[0].where;
      expect(where.officeId).toBe(OFFICE);
      expect(where.OR).toEqual([
        { name: { contains: 'mar', mode: 'insensitive' } },
        { email: { contains: 'mar', mode: 'insensitive' } },
      ]);
      expect(user.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 10, take: 10 });
      expect(user.count).toHaveBeenCalledWith({ where });
    });
  });

  describe('getInOffice', () => {
    it('escopa por officeId e trata usuário de outro escritório como 404', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(service.getInOffice(OFFICE, 'user-de-outro-escritorio')).rejects.toBeInstanceOf(NotFoundError);
      expect(user.findFirst).toHaveBeenCalledWith({ where: { id: 'user-de-outro-escritorio', officeId: OFFICE } });
    });
  });

  describe('create', () => {
    beforeEach(() => {
      user.findFirst.mockResolvedValue(null);
      user.create.mockImplementation(async ({ data }: { data: Partial<User> }) => makeUser(data));
    });

    it('cria no escritório da sessão, com mustChangePassword=true e só o HASH da senha provisória', async () => {
      const { user: created, temporaryPassword } = await service.create(ACTOR, {
        name: 'Maria Silva',
        email: 'maria@example.com',
        role: 'LAWYER',
      });

      const data = user.create.mock.calls[0]?.[0].data;
      expect(data.officeId).toBe(OFFICE);
      expect(data.mustChangePassword).toBe(true);
      expect(data.passwordHash).not.toBe(temporaryPassword);
      expect(await comparePassword(temporaryPassword, data.passwordHash)).toBe(true);
      expect(temporaryPassword).toHaveLength(16);
      expect(created.mustChangePassword).toBe(true);
    });

    it('audita a criação na mesma transação, sem vazar senha/hash', async () => {
      const { temporaryPassword } = await service.create(ACTOR, {
        name: 'Maria Silva',
        email: 'maria@example.com',
        role: 'LAWYER',
      });

      expect(auditLog.create).toHaveBeenCalledTimes(1);
      const logged = auditLog.create.mock.calls[0]?.[0].data;
      expect(logged).toMatchObject({
        officeId: OFFICE,
        actorId: ACTOR.userId,
        action: 'criou o usuário',
        entityType: 'User',
        entityId: 'user-2',
      });
      const serialized = JSON.stringify(logged);
      expect(serialized).not.toContain(temporaryPassword);
      expect(serialized).not.toContain('hash');
    });

    it('e-mail já existente (case-insensitive) → ConflictError, sem criar', async () => {
      user.findFirst.mockResolvedValue({ id: 'outro' });

      await expect(
        service.create(ACTOR, { name: 'Maria', email: 'MARIA@example.com', role: 'LAWYER' }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(user.create).not.toHaveBeenCalled();
    });

    it('corrida no índice único (P2002) → ConflictError, não um erro do Prisma', async () => {
      user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(
        service.create(ACTOR, { name: 'Maria', email: 'maria@example.com', role: 'LAWYER' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('updateRole', () => {
    it('ADMIN não pode alterar o próprio papel', async () => {
      await expect(service.updateRole(ACTOR, ACTOR.userId, 'LAWYER')).rejects.toBeInstanceOf(AuthorizationError);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('usuário de outro escritório → 404 (busca escopada por officeId)', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(service.updateRole(ACTOR, 'user-2', 'ADMIN')).rejects.toBeInstanceOf(NotFoundError);
      expect(user.findFirst).toHaveBeenCalledWith({ where: { id: 'user-2', officeId: OFFICE } });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('altera o papel e audita, com lock do escritório na mesma transação', async () => {
      user.findFirst.mockResolvedValue(makeUser({ role: 'ASSISTANT' }));
      user.update.mockResolvedValue(makeUser({ role: 'LAWYER' }));

      const updated = await service.updateRole(ACTOR, 'user-2', 'LAWYER');

      expect(updated.role).toBe('LAWYER');
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(user.update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { role: 'LAWYER' } });
      expect(auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
        officeId: OFFICE,
        actorId: ACTOR.userId,
        action: 'alterou o papel de',
        entityType: 'User',
        entityId: 'user-2',
      });
    });

    it('não permite remover o último ADMIN ativo', async () => {
      user.findFirst.mockResolvedValue(makeUser({ role: 'ADMIN' }));
      user.count.mockResolvedValue(1);

      await expect(service.updateRole(ACTOR, 'user-2', 'LAWYER')).rejects.toBeInstanceOf(ConflictError);
      expect(user.count).toHaveBeenCalledWith({ where: { officeId: OFFICE, role: 'ADMIN', status: 'ACTIVE' } });
      expect(user.update).not.toHaveBeenCalled();
      expect(auditLog.create).not.toHaveBeenCalled();
    });

    it('permite rebaixar um ADMIN quando há outro ADMIN ativo', async () => {
      user.findFirst.mockResolvedValue(makeUser({ role: 'ADMIN' }));
      user.count.mockResolvedValue(2);
      user.update.mockResolvedValue(makeUser({ role: 'LAWYER' }));

      await expect(service.updateRole(ACTOR, 'user-2', 'LAWYER')).resolves.toMatchObject({ role: 'LAWYER' });
    });

    it('mesmo papel: não escreve nem audita', async () => {
      user.findFirst.mockResolvedValue(makeUser({ role: 'LAWYER' }));

      await service.updateRole(ACTOR, 'user-2', 'LAWYER');

      expect(user.update).not.toHaveBeenCalled();
      expect(auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('ADMIN não pode desativar a si próprio', async () => {
      await expect(service.updateStatus(ACTOR, ACTOR.userId, 'INACTIVE')).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('usuário de outro escritório → 404', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus(ACTOR, 'user-2', 'INACTIVE')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('desativa (status=INACTIVE, sem DELETE) e audita', async () => {
      user.findFirst.mockResolvedValue(makeUser());
      user.update.mockResolvedValue(makeUser({ status: 'INACTIVE' }));

      const updated = await service.updateStatus(ACTOR, 'user-2', 'INACTIVE');

      expect(updated.status).toBe('INACTIVE');
      expect(user.update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { status: 'INACTIVE' } });
      expect(auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
        action: 'alterou o status do usuário',
        entityType: 'User',
        entityId: 'user-2',
        officeId: OFFICE,
        actorId: ACTOR.userId,
      });
    });

    it('não permite desativar o último ADMIN ativo', async () => {
      user.findFirst.mockResolvedValue(makeUser({ role: 'ADMIN' }));
      user.count.mockResolvedValue(1);

      await expect(service.updateStatus(ACTOR, 'user-2', 'INACTIVE')).rejects.toBeInstanceOf(ConflictError);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('reativar um ADMIN inativo não passa pela regra do último ADMIN', async () => {
      user.findFirst.mockResolvedValue(makeUser({ role: 'ADMIN', status: 'INACTIVE' }));
      user.update.mockResolvedValue(makeUser({ role: 'ADMIN', status: 'ACTIVE' }));

      await service.updateStatus(ACTOR, 'user-2', 'ACTIVE');

      expect(user.count).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('grava a nova senha e limpa mustChangePassword no mesmo UPDATE', async () => {
      const { hashPassword } = await import('../../src/shared/auth/password');
      user.findFirst.mockResolvedValue(null);
      const findUnique = vi.fn().mockResolvedValue(makeUser({ passwordHash: await hashPassword('Provisoria#1') }));
      const svc = new UserService({ user: { findUnique, update: user.update } } as never);

      await svc.changePassword('user-2', { currentPassword: 'Provisoria#1', newPassword: 'NovaSenha@123' });

      const args = user.update.mock.calls[0]?.[0];
      expect(args.where).toEqual({ id: 'user-2' });
      expect(args.data.mustChangePassword).toBe(false);
      expect(await comparePassword('NovaSenha@123', args.data.passwordHash)).toBe(true);
    });

    it('senha atual incorreta → 400 (não 401, para não deslogar o usuário) e nada é gravado', async () => {
      const { hashPassword } = await import('../../src/shared/auth/password');
      const findUnique = vi.fn().mockResolvedValue(makeUser({ passwordHash: await hashPassword('Provisoria#1') }));
      const svc = new UserService({ user: { findUnique, update: user.update } } as never);

      const attempt = svc.changePassword('user-2', { currentPassword: 'errada', newPassword: 'NovaSenha@123' });

      await expect(attempt).rejects.toBeInstanceOf(ValidationError);
      expect(user.update).not.toHaveBeenCalled();
    });
  });
});
