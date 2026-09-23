import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { AuthorizationError } from '../../src/shared/errors';
import { requireRole } from '../../src/shared/auth/require-role';

function makeRequest(role: 'ADMIN' | 'LAWYER' | 'ASSISTANT'): FastifyRequest {
  return {
    user: { userId: 'user-1', officeId: 'office-1', role },
  } as unknown as FastifyRequest;
}

describe('requireRole (RBAC)', () => {
  it('permite a passagem quando o papel do usuário está na lista permitida', async () => {
    const handler = requireRole('ADMIN', 'LAWYER');
    const request = makeRequest('LAWYER');

    await expect(handler(request, {} as FastifyReply)).resolves.toBeUndefined();
  });

  it('rejeita com AuthorizationError quando o papel não está autorizado', async () => {
    const handler = requireRole('ADMIN');
    const request = makeRequest('ASSISTANT');

    await expect(handler(request, {} as FastifyReply)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejeita ASSISTANT em rota exclusiva de ADMIN e LAWYER', async () => {
    const handler = requireRole('ADMIN', 'LAWYER');
    const request = makeRequest('ASSISTANT');

    await expect(handler(request, {} as FastifyReply)).rejects.toThrow(
      'Você não tem permissão para executar esta ação',
    );
  });
});
