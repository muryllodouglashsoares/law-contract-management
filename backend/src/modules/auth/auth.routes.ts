import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { authController } from './auth.controller';
import { loginBodySchema, type LoginBody } from './auth.schemas';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>(
    '/login',
    { preHandler: validate({ body: loginBodySchema }) },
    authController.login,
  );

  app.get(
    '/me',
    { preHandler: [authenticate] },
    authController.me,
  );
}
