import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicAuditLog } from '../../shared/utils/serialize-audit-log';
import type { ListAuditLogsQuery } from './audit.schemas';
import { AuditService } from './audit.service';

const auditService = new AuditService(prisma);

export const auditController = {
  async list(request: FastifyRequest<{ Querystring: ListAuditLogsQuery }>, reply: FastifyReply) {
    const result = await auditService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map(toPublicAuditLog),
      pagination: result.pagination,
    });
  },
};
