import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthenticationError } from '../errors';

/**
 * preHandler reutilizável para proteger rotas com JWT.
 *
 * 1. Extrai o token do header Authorization: Bearer <token>
 *    (feito internamente por request.jwtVerify(), via @fastify/jwt).
 * 2. Valida o token (assinatura e expiração).
 * 3. Identifica o usuário e popula request.user com { userId, officeId, role }.
 * 4. Rejeita com AuthenticationError (401) se o token estiver ausente,
 *    inválido, malformado ou expirado.
 *
 * Uso:
 *   app.get('/me', { preHandler: [authenticate] }, handler)
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AuthenticationError('Token de autenticação ausente ou inválido');
  }
}
