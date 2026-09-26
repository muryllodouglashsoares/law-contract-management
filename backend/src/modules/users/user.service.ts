import type { PrismaClient, User } from '@prisma/client';

import { comparePassword, hashPassword } from '../../shared/auth/password';
import { AuthenticationError, NotFoundError } from '../../shared/errors';
import type { ChangePasswordBody, UpdateMeBody } from './user.schemas';

export class UserService {
  constructor(private readonly prisma: Pick<PrismaClient, 'user'>) {}

  async getById(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    return user;
  }

  async updateMe(userId: string, data: UpdateMeBody): Promise<User> {
    // Garante que o usuário existe antes de tentar atualizar,
    // retornando um 404 claro em vez do erro genérico do Prisma.
    await this.getById(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /** Exige a senha atual correta antes de gravar a nova — nunca confie
   * apenas em o usuário estar autenticado para trocar a própria senha. */
  async changePassword(userId: string, data: ChangePasswordBody): Promise<void> {
    const user = await this.getById(userId);

    const isCurrentPasswordValid = await comparePassword(data.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new AuthenticationError('Senha atual incorreta');
    }

    const passwordHash = await hashPassword(data.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
