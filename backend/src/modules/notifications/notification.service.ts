import type { Notification, Prisma, PrismaClient } from '@prisma/client';

import { NotFoundError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { ListNotificationsQuery } from './notification.schemas';

export class NotificationService {
  constructor(private readonly prisma: Pick<PrismaClient, 'notification'>) {}

  /** Notificações são sempre dirigidas a um usuário específico — isoladas
   * tanto por officeId (tenant) quanto por userId (destinatário). */
  async list(officeId: string, userId: string, query: ListNotificationsQuery): Promise<Paginated<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      officeId,
      userId,
      ...(query.read !== undefined ? { read: query.read } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.notification.count({ where }),
    ]);

    return toPaginated(data, total, query as PaginationQuery);
  }

  async unreadCount(officeId: string, userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { officeId, userId, read: false } });
  }

  async markRead(officeId: string, userId: string, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({ where: { id, officeId, userId } });
    if (!notification) {
      throw new NotFoundError('Notificação não encontrada');
    }

    if (notification.read) return notification;

    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllRead(officeId: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { officeId, userId, read: false },
      data: { read: true },
    });
  }
}
