import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { requireRole } from '../../shared/auth/require-role';
import { validate } from '../../shared/http/validate';
import { officeController } from './office.controller';
import { updateOfficeBodySchema, type UpdateOfficeBody } from './office.schemas';

export async function officeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: [authenticate] }, officeController.me);

  app.patch<{ Body: UpdateOfficeBody }>(
    '/me',
    { preHandler: [authenticate, requireRole('ADMIN'), validate({ body: updateOfficeBodySchema })] },
    officeController.updateMe,
  );
}
