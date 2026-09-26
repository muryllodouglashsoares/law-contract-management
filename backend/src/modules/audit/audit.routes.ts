import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { auditController } from './audit.controller';
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from './audit.schemas';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListAuditLogsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listAuditLogsQuerySchema })] },
    auditController.list,
  );
}
