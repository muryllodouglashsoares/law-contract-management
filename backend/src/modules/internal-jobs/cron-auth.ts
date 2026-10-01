import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthenticationError, NotFoundError } from '../../shared/errors';
import { safeEqualSecret } from '../../shared/security/token';

/**
 * Autenticação dos jobs internos (GitHub Actions): `Authorization: Bearer <CRON_SECRET>`.
 * NÃO usa o JWT de usuário.
 *
 *  - CRON_SECRET ausente → a rota se comporta como inexistente (404): job desabilitado.
 *  - Segredo ausente/incorreto → 401 genérico (sem dizer qual parte falhou).
 *  - Comparação em tempo constante; o segredo nunca é logado (o header `authorization`
 *    também é redigido pelo logger em app.ts).
 */
export function createCronAuth(secret: string | undefined) {
  return async function cronAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!secret) {
      throw new NotFoundError('Rota não encontrada');
    }

    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    const provided = match?.[1];

    if (!provided || !safeEqualSecret(provided, secret)) {
      throw new AuthenticationError('Não autorizado');
    }
  };
}
