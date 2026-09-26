import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  read: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamsSchema = z.object({ id: z.string().uuid('ID de notificação inválido') });
export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
