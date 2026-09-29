import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../database/prisma';
import { AuthenticationError } from '../errors';

type AuthPrisma = { user: Pick<PrismaClient['user'], 'findUnique'> };

/**
 * Cria o preHandler de autenticação. Recebe o Prisma por parâmetro apenas para
 * permitir testes unitários com um client fake; a aplicação usa `authenticate` (abaixo).
 *
 * 1. Valida o JWT (assinatura, expiração) via request.jwtVerify() (@fastify/jwt).
 * 2. Consulta o usuário no banco a cada requisição: o JWT vale por até `JWT_EXPIRES_IN`
 *    e, sozinho, manteria acesso de quem foi desativado, removido ou rebaixado.
 * 3. Rejeita com AuthenticationError (401) se o usuário não existir, não estiver ACTIVE
 *    ou se o officeId do banco divergir do token (o tenant nunca é "corrigido" em silêncio).
 * 4. Popula request.user com o papel ATUAL do banco — o `role` do JWT não é fonte de verdade.
 */
export function createAuthenticate(db: AuthPrisma) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      throw new AuthenticationError('Token de autenticação ausente ou inválido');
    }

    // Fora do try/catch acima de propósito: falha de banco deve virar 500, não "sessão inválida".
    const user = await db.user.findUnique({
      where: { id: request.user.userId },
      select: { officeId: true, role: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE' || user.officeId !== request.user.officeId) {
      throw new AuthenticationError('Sessão inválida');
    }

    request.user.officeId = user.officeId;
    request.user.role = user.role;
  };
}

/**
 * preHandler reutilizável para proteger rotas com JWT.
 *
 * Uso:
 *   app.get('/me', { preHandler: [authenticate] }, handler)
 */
export const authenticate = createAuthenticate(prisma);
