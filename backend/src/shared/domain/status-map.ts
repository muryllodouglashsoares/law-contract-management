import type {
  ClientStatus,
  ContractStatus,
  ContractTemplateStatus,
  DocumentCategory,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';

import { daysUntil } from '../utils/dates';

/**
 * Camada única de tradução entre os enums do banco (em inglês, seguindo a
 * convenção já usada por UserRole/UserStatus) e os literais em português
 * que o frontend existente já consome via `statusConfig` / `StatusBadge`
 * (src/data/mock.ts). Mantida centralizada aqui para que o significado de
 * cada status só precise ser decidido uma vez.
 *
 * Exposta como funções (não como Record indexado diretamente): além de
 * satisfazer `noUncheckedIndexedAccess` do tsconfig, isso garante um
 * fallback seguro caso um valor de enum novo seja adicionado ao schema
 * sem que o mapa correspondente seja atualizado — nunca deixamos um
 * `undefined` vazar para a resposta da API.
 */

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>;
}

function mapper<K extends string, V extends string>(map: Record<K, V>) {
  return (key: K): V => map[key] ?? (key as unknown as V);
}

const CONTRACT_STATUS_MAP: Record<ContractStatus, string> = {
  RASCUNHO: 'rascunho',
  PRONTO_ENVIO: 'pronto_envio',
  APROVADO: 'aprovado',
  ENVIADO: 'enviado',
  EM_REVISAO: 'em_revisao',
  ASSINADO: 'assinado',
  ATIVO: 'ativo',
  ENCERRADO: 'encerrado',
  CANCELADO: 'cancelado',
};
export const CONTRACT_STATUS_TO_API = mapper(CONTRACT_STATUS_MAP);
export const CONTRACT_STATUS_FROM_API = mapper(invert(CONTRACT_STATUS_MAP));

/**
 * Transições de status permitidas para um contrato. Reforçada no backend
 * (nunca confie em uma checagem apenas no frontend) para impedir pular
 * etapas do fluxo (ex.: ir direto de RASCUNHO para ATIVO).
 */
const CONTRACT_STATUS_TRANSITIONS_MAP: Record<ContractStatus, ContractStatus[]> = {
  RASCUNHO: ['PRONTO_ENVIO', 'ENVIADO', 'CANCELADO'],
  // PRONTO_ENVIO = aguardando revisão interna quando a aprovação está habilitada; o `reject` devolve
  // para RASCUNHO. APROVADO só é alcançado pelo endpoint de aprovação (nunca por PATCH /status).
  PRONTO_ENVIO: ['APROVADO', 'ENVIADO', 'RASCUNHO', 'CANCELADO'],
  APROVADO: ['ENVIADO', 'RASCUNHO', 'CANCELADO'],
  ENVIADO: ['EM_REVISAO', 'ASSINADO', 'CANCELADO'],
  EM_REVISAO: ['ENVIADO', 'ASSINADO', 'CANCELADO'],
  ASSINADO: ['ATIVO', 'CANCELADO'],
  ATIVO: ['ENCERRADO'],
  ENCERRADO: [],
  CANCELADO: [],
};
export function contractStatusTransitionsFrom(status: ContractStatus): ContractStatus[] {
  return CONTRACT_STATUS_TRANSITIONS_MAP[status] ?? [];
}

/**
 * Transições que NÃO podem ser feitas por PATCH /contracts/:id/status mesmo estando no mapa acima:
 *  - para APROVADO e a volta para RASCUNHO a partir de PRONTO_ENVIO/APROVADO têm endpoints próprios
 *    (approve/reject), que registram auditoria, motivo e notificações.
 * Com a aprovação interna ATIVA, o envio ao cliente (ENVIADO) só é permitido a partir de APROVADO.
 */
export function isTransitionBlockedForGenericStatusUpdate(
  from: ContractStatus,
  to: ContractStatus,
  requireInternalApproval: boolean,
): { blocked: boolean; reason?: string } {
  if (to === 'APROVADO') {
    return { blocked: true, reason: 'Use a ação "Aprovar" da revisão interna para aprovar o contrato.' };
  }
  if ((from === 'PRONTO_ENVIO' || from === 'APROVADO') && to === 'RASCUNHO') {
    return { blocked: true, reason: 'Use a ação "Devolver" da revisão interna para devolver o contrato ao rascunho.' };
  }
  if (requireInternalApproval && to === 'ENVIADO' && from !== 'APROVADO' && from !== 'EM_REVISAO') {
    return { blocked: true, reason: 'A aprovação interna está habilitada: o contrato precisa ser aprovado antes de ser enviado.' };
  }
  if (requireInternalApproval && to === 'PRONTO_ENVIO') {
    return { blocked: true, reason: 'Use a ação "Enviar para revisão" para submeter o contrato à aprovação interna.' };
  }
  return { blocked: false };
}

/**
 * Status em que um link de aceite eletrônico pode ser gerado E usado.
 * São exatamente os status com transição válida para ASSINADO em
 * CONTRACT_STATUS_TRANSITIONS_MAP (PRONTO_ENVIO não vai direto para ASSINADO,
 * então fica de fora: o contrato precisa ser marcado como enviado antes).
 */
export const SIGNABLE_CONTRACT_STATUSES: ContractStatus[] = ['ENVIADO', 'EM_REVISAO'];

/** Status relevantes para o alerta de renovação: contratos vigentes/assinados. */
export const RENEWAL_ALERT_CONTRACT_STATUSES: ContractStatus[] = ['ATIVO', 'ASSINADO'];

const CLIENT_STATUS_MAP: Record<ClientStatus, string> = {
  ACTIVE: 'ativo',
  INACTIVE: 'inativo',
};
export const CLIENT_STATUS_TO_API = mapper(CLIENT_STATUS_MAP);
export const CLIENT_STATUS_FROM_API = mapper(invert(CLIENT_STATUS_MAP));

const TEMPLATE_STATUS_MAP: Record<ContractTemplateStatus, string> = {
  ACTIVE: 'ativo',
  DRAFT: 'rascunho',
};
export const TEMPLATE_STATUS_TO_API = mapper(TEMPLATE_STATUS_MAP);
export const TEMPLATE_STATUS_FROM_API = mapper(invert(TEMPLATE_STATUS_MAP));

const DOCUMENT_CATEGORY_MAP: Record<DocumentCategory, string> = {
  CONTRATO: 'contrato',
  PROCURACAO: 'procuração',
  DOCUMENTO: 'documento',
  OUTRO: 'outro',
};
export const DOCUMENT_CATEGORY_TO_API = mapper(DOCUMENT_CATEGORY_MAP);
export const DOCUMENT_CATEGORY_FROM_API = mapper(invert(DOCUMENT_CATEGORY_MAP));

const PAYMENT_METHOD_MAP: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
};
export const PAYMENT_METHOD_TO_API = mapper(PAYMENT_METHOD_MAP);
export const PAYMENT_METHOD_FROM_API = mapper(invert(PAYMENT_METHOD_MAP));

/**
 * Status de pagamento exibido ao usuário. PENDING é sempre traduzido para
 * 'atrasado' (venceu), 'pendente' (vence nos próximos 30 dias) ou 'futuro'
 * (vence depois disso) com base na data atual — nunca persistido, para não
 * exigir um job agendado mantendo esse campo em dia.
 */
const SOON_THRESHOLD_DAYS = 30;

export function derivePaymentDisplayStatus(status: PaymentStatus, dueDate: Date, now = new Date()): string {
  if (status === 'PAID') return 'pago';
  if (status === 'CANCELLED') return 'cancelado';

  // Em dias-calendário UTC: uma parcela que vence HOJE ainda não está atrasada (o alerta diário
  // trata "vence hoje" e "atrasada há 1 dia" como situações distintas).
  const daysUntilDue = daysUntil(dueDate, now);
  if (daysUntilDue < 0) return 'atrasado';
  if (daysUntilDue <= SOON_THRESHOLD_DAYS) return 'pendente';
  return 'futuro';
}
