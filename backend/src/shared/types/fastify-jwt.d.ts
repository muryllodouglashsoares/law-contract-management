import '@fastify/jwt';

import type { UserRole } from '@prisma/client';

/**
 * Formato do contexto de autenticação anexado a cada requisição
 * autenticada (request.user), após authenticate() validar o JWT.
 * Mantém apenas o essencial: quem é o usuário, de qual escritório
 * (multi-tenant) e qual seu papel (para RBAC).
 */
export interface AuthContext {
  userId: string;
  officeId: string;
  role: UserRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthContext;
    user: AuthContext;
  }
}
