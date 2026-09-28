import type { PrismaClient } from '@prisma/client';

export interface AuditLogInput {
  officeId: string;
  actorId: string | null;
  /** Só precisa ser informado quando actorId é null (ação sem um usuário
   * humano, ex.: "Sistema"). Com actorId presente, o nome do autor é obtido
   * por join com User na leitura — não duplicamos o nome aqui. */
  actorLabel?: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
}

/**
 * Vocabulário padronizado de ações, para manter a HistoryPage consistente
 * entre os módulos (evita cada service inventar seu próprio texto).
 */
export const AUDIT_ACTIONS = {
  CREATED: 'criou',
  UPDATED: 'atualizou',
  DELETED: 'removeu',
  STATUS_CHANGED: 'alterou o status de',
  SENT: 'enviou',
  SIGNED: 'marcou como assinado',
  PAYMENT_REGISTERED: 'registrou pagamento de',
  PAYMENT_UPDATED: 'atualizou o pagamento de',
  DOCUMENT_UPLOADED: 'enviou o documento',
  DOCUMENT_DELETED: 'removeu o documento',
  CONTRACT_PDF_GENERATED: 'gerou o PDF do',
} as const;

/**
 * Escreve um registro de auditoria. Recebe o client do Prisma por parâmetro
 * (em vez de importar o singleton) para que possa ser chamado tanto fora
 * de uma transação quanto dentro de `prisma.$transaction(async (tx) => ...)`,
 * garantindo que a auditoria nunca fique dessincronizada da operação que
 * ela descreve — ou ambas persistem, ou nenhuma.
 *
 * O backend é sempre o responsável por criar estes registros; o frontend
 * nunca escreve histórico diretamente.
 */
export async function writeAuditLog(
  prisma: Pick<PrismaClient, 'auditLog'>,
  input: AuditLogInput,
): Promise<void> {
  await prisma.auditLog.create({ data: input });
}
