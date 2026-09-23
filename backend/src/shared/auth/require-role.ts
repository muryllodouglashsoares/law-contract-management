import type { UserRole } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthorizationError } from '../errors';

/**
 * Cria um preHandler que restringe o acesso a uma rota por papel (role).
 *
 * Deve ser usado SEMPRE depois de authenticate() na cadeia de preHandlers,
 * pois depende de request.user já estar populado.
 *
 * O controle de acesso é feito no backend — nunca confie apenas no
 * frontend para esconder ações ou dados sensíveis.
 *
 * Uso:
 *   app.delete('/users/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function requireRoleHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const { role } = request.user;

    if (!allowedRoles.includes(role)) {
      throw new AuthorizationError('Você não tem permissão para executar esta ação');
    }
  };
}
