import type { Notification } from '@prisma/client';

export interface PublicNotification {
  id: string;
  type: Notification['type'];
  title: string;
  description: string;
  priority: boolean;
  read: boolean;
  createdAt: string;
}

export function toPublicNotification(notification: Notification): PublicNotification {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    priority: notification.priority,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  };
}
