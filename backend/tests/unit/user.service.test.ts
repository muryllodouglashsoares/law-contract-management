import type { PrismaClient, User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserService } from '../../src/modules/users/user.service';
import { NotFoundError } from '../../src/shared/errors';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    officeId: 'office-1',
    name: 'Usuário Teste',
    email: 'user@example.com',
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

describe('UserService', () => {
  let findUnique: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let userService: UserService;

  beforeEach(() => {
    findUnique = vi.fn();
    update = vi.fn();
    const prismaMock = { user: { findUnique, update } } as unknown as ConstructorParameters<typeof UserService>[0];
    userService = new UserService(prismaMock);
  });

  it('retorna o usuário quando encontrado', async () => {
    findUnique.mockResolvedValue(makeUser());

    const user = await userService.getById('user-1');

    expect(user.id).toBe('user-1');
  });

  it('lança NotFoundError quando o usuário não existe', async () => {
    findUnique.mockResolvedValue(null);

    await expect(userService.getById('inexistente')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('atualiza somente os campos informados', async () => {
    findUnique.mockResolvedValue(makeUser());
    update.mockResolvedValue(makeUser({ name: 'Novo Nome' }));

    const updated = await userService.updateMe('user-1', { name: 'Novo Nome' });

    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { name: 'Novo Nome' } });
    expect(updated.name).toBe('Novo Nome');
  });

  it('não atualiza um usuário inexistente', async () => {
    findUnique.mockResolvedValue(null);

    await expect(userService.updateMe('inexistente', { name: 'Novo Nome' })).rejects.toBeInstanceOf(NotFoundError);
    expect(update).not.toHaveBeenCalled();
  });
});
