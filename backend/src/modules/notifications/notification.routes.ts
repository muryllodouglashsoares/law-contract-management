import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { notificationController } from './notification.controller';
import { pushRoutes } from './push.routes';
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  type ListNotificationsQuery,
  type NotificationIdParams,
} from './notification.schemas';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // Web Push: /notifications/push/*
  await app.register(pushRoutes, { prefix: '/push' });

  app.get<{ Querystring: ListNotificationsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listNotificationsQuerySchema })] },
    notificationController.list,
  );

  app.patch<{ Params: NotificationIdParams }>(
    '/:id/read',
    { preHandler: [authenticate, validate({ params: notificationIdParamsSchema })] },
    notificationController.markRead,
  );

  app.patch('/read-all', { preHandler: [authenticate] }, notificationController.markAllRead);
}
