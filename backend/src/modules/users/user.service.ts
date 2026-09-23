import type { PrismaClient, User } from '@prisma/client';

import { NotFoundError } from '../../shared/errors';
import type { UpdateMeBody } from './user.schemas';

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
}
