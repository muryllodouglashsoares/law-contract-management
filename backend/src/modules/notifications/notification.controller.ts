import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicNotification } from '../../shared/utils/serialize-notification';
import type { ListNotificationsQuery, NotificationIdParams } from './notification.schemas';
import { NotificationService } from './notification.service';

const notificationService = new NotificationService(prisma);

export const notificationController = {
  async list(request: FastifyRequest<{ Querystring: ListNotificationsQuery }>, reply: FastifyReply) {
    const result = await notificationService.list(request.user.officeId, request.user.userId, request.query);
    const unreadCount = await notificationService.unreadCount(request.user.officeId, request.user.userId);
    return reply.status(200).send({
      data: result.data.map(toPublicNotification),
      pagination: result.pagination,
      unreadCount,
    });
  },

  async markRead(request: FastifyRequest<{ Params: NotificationIdParams }>, reply: FastifyReply) {
    const notification = await notificationService.markRead(
      request.user.officeId,
      request.user.userId,
      request.params.id,
    );
    return reply.status(200).send({ notification: toPublicNotification(notification) });
  },

  async markAllRead(request: FastifyRequest, reply: FastifyReply) {
    await notificationService.markAllRead(request.user.officeId, request.user.userId);
    return reply.status(204).send();
  },
};
