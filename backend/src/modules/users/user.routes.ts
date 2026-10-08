import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { requireRole } from '../../shared/auth/require-role';
import { validate } from '../../shared/http/validate';
import { userController } from './user.controller';
import {
  changePasswordBodySchema,
  createUserBodySchema,
  listUsersQuerySchema,
  updateMeBodySchema,
  updateNotificationPreferencesBodySchema,
  type UpdateNotificationPreferencesBody,
  updateUserRoleBodySchema,
  updateUserStatusBodySchema,
  userIdParamsSchema,
  type ChangePasswordBody,
  type CreateUserBody,
  type ListUsersQuery,
  type UpdateMeBody,
  type UpdateUserRoleBody,
  type UpdateUserStatusBody,
  type UserIdParams,
} from './user.schemas';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: [authenticate] }, userController.me);

  app.patch<{ Body: UpdateMeBody }>(
    '/me',
    { preHandler: [authenticate, validate({ body: updateMeBodySchema })] },
    userController.updateMe,
  );

  app.patch<{ Body: ChangePasswordBody }>(
    '/me/password',
    { preHandler: [authenticate, validate({ body: changePasswordBodySchema })] },
    userController.changePassword,
  );

  app.get('/me/notification-preferences', { preHandler: [authenticate] }, userController.getNotificationPreferences);

  app.patch<{ Body: UpdateNotificationPreferencesBody }>(
    '/me/notification-preferences',
    { preHandler: [authenticate, validate({ body: updateNotificationPreferencesBodySchema })] },
    userController.updateNotificationPreferences,
  );

  // Gestão de usuários: somente ADMIN, sempre no escritório da sessão.
  const adminOnly = [authenticate, requireRole('ADMIN')];

  app.get<{ Querystring: ListUsersQuery }>(
    '/',
    { preHandler: [...adminOnly, validate({ querystring: listUsersQuerySchema })] },
    userController.list,
  );

  app.post<{ Body: CreateUserBody }>(
    '/',
    { preHandler: [...adminOnly, validate({ body: createUserBodySchema })] },
    userController.create,
  );

  app.get<{ Params: UserIdParams }>(
    '/:id',
    { preHandler: [...adminOnly, validate({ params: userIdParamsSchema })] },
    userController.getById,
  );

  app.patch<{ Params: UserIdParams; Body: UpdateUserRoleBody }>(
    '/:id/role',
    {
      preHandler: [
        ...adminOnly,
        validate({ params: userIdParamsSchema, body: updateUserRoleBodySchema }),
      ],
    },
    userController.updateRole,
  );

  app.patch<{ Params: UserIdParams; Body: UpdateUserStatusBody }>(
    '/:id/status',
    {
      preHandler: [
        ...adminOnly,
        validate({ params: userIdParamsSchema, body: updateUserStatusBodySchema }),
      ],
    },
    userController.updateStatus,
  );
}
