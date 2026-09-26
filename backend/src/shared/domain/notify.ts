import type { NotificationType, PrismaClient } from '@prisma/client';

export interface NotificationInput {
  officeId: string;
  userId: string;
  type: NotificationType;
  title: string;
  description: string;
  priority?: boolean;
}

/**
 * Cria uma notificação a partir de um evento real do sistema (ex.: contrato
 * enviado, pagamento registrado). Assim como writeAuditLog, aceita o client
 * do Prisma por parâmetro para poder ser chamado dentro de uma transação
 * já aberta pelo service que originou o evento.
 */
export async function createNotification(
  prisma: Pick<PrismaClient, 'notification'>,
  input: NotificationInput,
): Promise<void> {
  await prisma.notification.create({ data: { ...input, priority: input.priority ?? false } });
}
