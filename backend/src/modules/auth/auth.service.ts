import type { PrismaClient, User } from '@prisma/client';

import { AuthenticationError } from '../../shared/errors';
import { comparePassword } from '../../shared/auth/password';

/**
 * Serviço de autenticação. Recebe o PrismaClient por injeção de
 * dependência (em vez de importar o singleton diretamente) para
 * facilitar testes unitários com um client "fake"/mockado.
 */
export class AuthService {
  constructor(private readonly prisma: Pick<PrismaClient, 'user'>) {}

  /**
   * Valida e-mail e senha. Lança AuthenticationError genérico tanto para
   * "usuário não encontrado" quanto para "senha incorreta" — nunca revele
   * qual dos dois falhou, para não facilitar enumeração de e-mails
   * cadastrados.
   */
  async login(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new AuthenticationError('E-mail ou senha inválidos');
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthenticationError('Usuário inativo. Contate o administrador do escritório.');
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AuthenticationError('E-mail ou senha inválidos');
    }

    return user;
  }

  /** Usado por GET /auth/me para recarregar os dados atuais do usuário autenticado. */
  async getAuthenticatedUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('Sessão inválida');
    }

    return user;
  }
}
