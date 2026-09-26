import type { AuditLog } from '@prisma/client';

export type AuditLogWithActor = AuditLog & { actor: { id: string; name: string } | null };

export interface PublicAuditLog {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  createdAt: string;
}

/** O nome do autor vem do join com User quando existe; `actorLabel` só é
 * usado como texto de apoio para ações sem um usuário humano (ver schema.prisma). */
export function toPublicAuditLog(log: AuditLogWithActor): PublicAuditLog {
  return {
    id: log.id,
    actorName: log.actor?.name ?? log.actorLabel ?? 'Sistema',
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    entityLabel: log.entityLabel,
    createdAt: log.createdAt.toISOString(),
  };
}
