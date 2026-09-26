import type { Prisma, PrismaClient } from '@prisma/client';

import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { AuditLogWithActor } from '../../shared/utils/serialize-audit-log';
import type { ListAuditLogsQuery } from './audit.schemas';

const AUDIT_LOG_INCLUDE = { actor: { select: { id: true, name: true } } };

export class AuditService {
  constructor(private readonly prisma: Pick<PrismaClient, 'auditLog'>) {}

  async list(officeId: string, query: ListAuditLogsQuery): Promise<Paginated<AuditLogWithActor>> {
    const where: Prisma.AuditLogWhereInput = {
      officeId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.search
        ? {
            OR: [
              { entityLabel: { contains: query.search, mode: 'insensitive' } },
              { action: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: AUDIT_LOG_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPaginated(data as AuditLogWithActor[], total, query as PaginationQuery);
  }
}
