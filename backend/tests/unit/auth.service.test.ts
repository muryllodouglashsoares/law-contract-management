import type { PrismaClient, User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthenticationError } from '../../src/shared/errors';
import { hashPassword } from '../../src/shared/auth/password';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    officeId: 'office-1',
    name: 'Usuário Teste',
    email: 'user@example.com',
    phone: null,
    oabNumber: null,
    passwordHash: '',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let findUnique: ReturnType<typeof vi.fn>;
  let prismaMock: Pick<PrismaClient, 'user'>;
  let authService: AuthService;

  beforeEach(() => {
    findUnique = vi.fn();
    prismaMock = { user: { findUnique } } as unknown as Pick<PrismaClient, 'user'>;
    authService = new AuthService(prismaMock);
  });

  it('autentica com sucesso quando e-mail existe, usuário está ativo e a senha confere', async () => {
    const passwordHash = await hashPassword('Senha@123');
    findUnique.mockResolvedValue(makeUser({ passwordHash }));

    const user = await authService.login('user@example.com', 'Senha@123');

    expect(user.email).toBe('user@example.com');
  });

  it('rejeita quando o e-mail não existe, sem revelar essa informação', async () => {
    findUnique.mockResolvedValue(null);

    await expect(authService.login('desconhecido@example.com', 'qualquer')).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('rejeita quando a senha está incorreta', async () => {
    const passwordHash = await hashPassword('Senha@123');
    findUnique.mockResolvedValue(makeUser({ passwordHash }));

    await expect(authService.login('user@example.com', 'senha-errada')).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('rejeita usuário inativo mesmo com senha correta', async () => {
    const passwordHash = await hashPassword('Senha@123');
    findUnique.mockResolvedValue(makeUser({ passwordHash, status: 'INACTIVE' }));

    await expect(authService.login('user@example.com', 'Senha@123')).rejects.toBeInstanceOf(AuthenticationError);
  });
});
