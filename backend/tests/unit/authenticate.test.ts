import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthenticate } from '../../src/shared/auth/authenticate';
import { errorHandler } from '../../src/shared/http/error-handler';

// O Prisma é injetado via createAuthenticate; evita instanciar o PrismaClient real.
vi.mock('../../src/shared/database/prisma', () => ({ prisma: {} }));

type DbUser = { officeId: string; role: 'ADMIN' | 'LAWYER' | 'ASSISTANT'; status: 'ACTIVE' | 'INACTIVE' };

/**
 * Sobe um Fastify mínimo com @fastify/jwt REAL (assinatura/expiração de verdade)
 * e um Prisma fake — sem banco.
 */
describe('authenticate (JWT + usuário no banco)', () => {
  let app: FastifyInstance;
  let findUnique: ReturnType<typeof vi.fn>;

  const signToken = (payload: Record<string, unknown>, options: { expiresIn?: string | number } = {}) =>
    app.jwt.sign(
      { userId: 'user-1', officeId: 'office-1', role: 'ADMIN', ...payload } as never,
      { expiresIn: options.expiresIn ?? '1h' },
    );

  const call = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/protected',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  beforeEach(async () => {
    findUnique = vi.fn();
    app = Fastify();
    app.register(jwt, { secret: 'test-secret-with-at-least-16-chars' });
    app.setErrorHandler(errorHandler);
    const authenticate = createAuthenticate({ user: { findUnique } } as never);
    app.get('/protected', { preHandler: [authenticate] }, async (request) => ({ user: request.user }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const activeUser = (overrides: Partial<DbUser> = {}): DbUser => ({
    officeId: 'office-1',
    role: 'ADMIN',
    status: 'ACTIVE',
    ...overrides,
  });

  it('token válido + usuário ativo → passa', async () => {
    findUnique.mockResolvedValue(activeUser());

    const response = await call(signToken({}));

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ userId: 'user-1', officeId: 'office-1', role: 'ADMIN' });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
  });

  it('usuário inexistente → 401', async () => {
    findUnique.mockResolvedValue(null);

    const response = await call(signToken({}));

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('usuário inativo com token ainda válido → 401 (não 403)', async () => {
    findUnique.mockResolvedValue(activeUser({ status: 'INACTIVE' }));

    const response = await call(signToken({}));

    expect(response.statusCode).toBe(401);
  });

  it('officeId divergente entre token e banco → 401', async () => {
    findUnique.mockResolvedValue(activeUser({ officeId: 'office-2' }));

    const response = await call(signToken({ officeId: 'office-1' }));

    expect(response.statusCode).toBe(401);
  });

  it('papel alterado no banco: request recebe o papel ATUAL, não o do token', async () => {
    findUnique.mockResolvedValue(activeUser({ role: 'ASSISTANT' }));

    const response = await call(signToken({ role: 'ADMIN' }));

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('ASSISTANT');
  });

  it('token expirado → 401, sem consultar o banco', async () => {
    const response = await call(signToken({}, { expiresIn: -10 }));

    expect(response.statusCode).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('token inválido / ausente → 401, sem consultar o banco', async () => {
    expect((await call('token-invalido')).statusCode).toBe(401);
    expect((await call()).statusCode).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falha do banco não vira "sessão inválida": propaga como 500', async () => {
    findUnique.mockRejectedValue(new Error('db down'));

    const response = await call(signToken({}));

    expect(response.statusCode).toBe(500);
  });
});
