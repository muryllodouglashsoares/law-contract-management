import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { userController } from './user.controller';
import { updateMeBodySchema, type UpdateMeBody } from './user.schemas';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: [authenticate] }, userController.me);

  app.patch<{ Body: UpdateMeBody }>(
    '/me',
    { preHandler: [authenticate, validate({ body: updateMeBodySchema })] },
    userController.updateMe,
  );
}
