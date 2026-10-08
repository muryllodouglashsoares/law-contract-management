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
  SIGNATURE_LINK_CREATED: 'gerou link de aceite eletrônico do',
  ELECTRONIC_SIGNED: 'assinou eletronicamente',
  RENEWAL_ALERT_SENT: 'enviou alerta de renovação do',
  PAYMENT_ALERT_SENT: 'enviou alerta de pagamento do',
  PAYMENT_INSTALLMENTS_GENERATED: 'gerou as parcelas do',
  PIX_PAYMENT_REGISTERED: 'registrou pagamento via PIX de',
  SIGNATURE_LINK_ALERT_SENT: 'enviou alerta do link de assinatura do',
  SIGNED_PDF_GENERATED: 'gerou o PDF assinado do',
  SIGNED_PDF_FAILED: 'não conseguiu gerar o PDF assinado do',
  SIGNATURE_LINK_EMAILED: 'enviou por e-mail o link de assinatura do',
  CONTRACT_RENEWED: 'renovou o',
  CONTRACT_SUBMITTED_FOR_REVIEW: 'enviou para revisão interna o',
  CONTRACT_APPROVED: 'aprovou o',
  CONTRACT_REJECTED: 'devolveu para ajustes o',
  TWO_FACTOR_ENABLED: 'ativou a autenticação em dois fatores',
  TWO_FACTOR_DISABLED: 'desativou a autenticação em dois fatores',
  USER_CREATED: 'criou o usuário',
  USER_ROLE_CHANGED: 'alterou o papel de',
  USER_STATUS_CHANGED: 'alterou o status do usuário',
} as const;

/** Rótulo de autor das ações automáticas (job de renovação, aceite público). */
export const SYSTEM_ACTOR_LABEL = 'Sistema';

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
