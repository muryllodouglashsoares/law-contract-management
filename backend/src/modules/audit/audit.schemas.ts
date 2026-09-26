import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
