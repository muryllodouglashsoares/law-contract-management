/**
 * Tipos que espelham exatamente os DTOs (`Public*`) devolvidos pela API do
 * backend (ver backend/src/shared/utils/serialize-*.ts). Mantidos aqui em
 * vez de `any`/inferência solta para que o TypeScript detecte divergências
 * entre frontend e backend em tempo de compilação.
 */

export type UserRole = 'ADMIN' | 'LAWYER' | 'ASSISTANT';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  oabNumber: string | null;
  role: UserRole;
  status: UserStatus;
  /** true enquanto o usuário usa a senha provisória: o app exige a troca antes de liberar o acesso. */
  mustChangePassword: boolean;
}

export interface Office {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string;
  address: string | null;
  specialties: string | null;
  /** Aprovação interna: o envio ao cliente exige contrato APROVADO por um ADMIN/LAWYER. */
  requireInternalApproval: boolean;
}

export type ClientType = 'PF' | 'PJ';
/** Mesmos literais em português já usados pelo StatusBadge existente. */
export type ClientStatusApi = 'ativo' | 'inativo';

export interface Client {
  id: string;
  type: ClientType;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: ClientStatusApi;
  contractsCount: number;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

export type TemplateStatusApi = 'ativo' | 'rascunho';

export interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  status: TemplateStatusApi;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ContractStatusApi =
  | 'rascunho'
  | 'pronto_envio'
  | 'aprovado'
  | 'enviado'
  | 'em_revisao'
  | 'assinado'
  | 'ativo'
  | 'encerrado'
  | 'cancelado';

export interface Contract {
  id: string;
  number: number;
  status: ContractStatusApi;
  value: number;
  object: string;
  startDate: string;
  /** Data de término; null em contratos antigos / prazo indeterminado. */
  endDate: string | null;
  termText: string | null;
  conditions: string | null;
  createdAt: string;
  updatedAt: string;
  /** `phone` vem do cadastro do cliente (null quando não informado); usado no botão "Enviar por WhatsApp". */
  client: { id: string; name: string; document: string; email: string; phone: string | null };
  template: { id: string; name: string };
  responsible: { id: string; name: string };
  currentVersion: { versionNumber: number; content: string; createdAt: string } | null;
  /** Último ciclo da revisão interna (aprovação). */
  internalReview: {
    submittedBy: { id: string; name: string } | null;
    submittedAt: string | null;
    decision: 'approved' | 'rejected' | null;
    decidedBy: { id: string; name: string } | null;
    decidedAt: string | null;
    rejectionReason: string | null;
  };
}

export interface ContractVersion {
  versionNumber: number;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
}

export type DocumentCategoryApi = 'contrato' | 'procuração' | 'documento' | 'outro';

export interface AppDocument {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategoryApi;
  contract: { id: string; number: number; client: { id: string; name: string } };
  uploadedBy: { id: string; name: string };
  /** Versão do contrato que originou o arquivo (PDFs gerados); null em uploads manuais. */
  versionNumber: number | null;
  /** true = PDF FINAL com o comprovante de aceite eletrônico ("PDF assinado"). */
  signed: boolean;
  createdAt: string;
}

export type PaymentStatusApi = 'pendente' | 'pago' | 'atrasado' | 'futuro' | 'cancelado';
export type PaymentMethodApi = 'PIX' | 'Transferência' | 'Boleto' | 'Dinheiro' | 'Cartão';

export interface Payment {
  id: string;
  installmentNumber: number;
  installmentTotal: number;
  value: number;
  dueDate: string;
  status: PaymentStatusApi;
  method: PaymentMethodApi | null;
  paidAt: string | null;
  notes: string | null;
  /** Pix copia e cola. Exibir/copiar NÃO baixa a parcela: a baixa é sempre manual. */
  pixCode: string | null;
  pixKey: string | null;
  pixInstructions: string | null;
  contract: { id: string; number: number; client: { id: string; name: string } };
  createdAt: string;
}

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  priority: boolean;
  read: boolean;
  /** Caminho interno para abrir o contrato relacionado (ou null). */
  link: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  createdAt: string;
}

export interface DashboardSummary {
  metrics: {
    activeClients: number;
    newClientsThisMonth: number;
    activeContracts: number;
    pendingActionContracts: number;
    overduePaymentsCount: number;
    receivableNext30Days: number;
  };
  contractStatusChart: { name: string; value: number; color: string }[];
  recentContracts: Contract[];
  recentActivity: AuditLogEntry[];
  upcomingPayments: Payment[];
}

// --- Busca global ------------------------------------------------------

export interface GlobalSearchResults {
  clients: { id: string; label: string; description: string | null }[];
  contracts: { id: string; number: number; label: string; description: string; clientName: string }[];
  templates: { id: string; label: string; description: string | null }[];
  documents: { id: string; label: string; description: string; contractId: string }[];
  users: { id: string; label: string; description: string }[];
}

// --- Aceite eletrônico (assinatura eletrônica simples) -------------------

export interface SignatureLink {
  url: string;
  expiresAt: string;
  singleUse: true;
  versionNumber: number;
  /** Resultado do envio por e-mail (somente quando solicitado). */
  email?: SignatureEmailStatus;
}

export type SignatureEmailStatus = 'sent' | 'failed' | 'unavailable' | 'disabled_by_preference';

export type SignatureLinkState = 'active' | 'used' | 'expired' | 'revoked';

export interface ContractSignatureRecord {
  id: string;
  state: SignatureLinkState;
  versionNumber: number;
  createdAt: string;
  expiresAt: string;
  signedAt: string | null;
  signerName: string | null;
  signerDocumentMasked: string | null;
  signerIp: string | null;
  signatureHash: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  /** Documento do PDF assinado (comprovante), quando já gerado. */
  signedDocumentId: string | null;
}

export interface PublicSignatureView {
  officeName: string;
  contract: {
    number: number;
    object: string;
    value: number;
    startDate: string;
    endDate: string | null;
    clientName: string;
  };
  version: { versionNumber: number; content: string; createdAt: string };
  expiresAt: string;
  singleUse: true;
  consent: { text: string; version: string };
}

export interface PublicSignatureResult {
  signed: true;
  signedAt: string;
  signatureId: string;
  signatureHash: string;
  signerName: string;
  contractNumber: number;
}

// --- Preferências de notificação / 2FA ------------------------------------

export interface NotificationPreferences {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
}

export interface TwoFactorStatus {
  /** false = servidor sem TWO_FACTOR_ENCRYPTION_KEY (produção): 2FA indisponível. */
  available: boolean;
  /** Somente ADMIN e LAWYER. */
  eligible: boolean;
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
}

export type LoginResponse =
  | { accessToken: string; user: User }
  | { requiresTwoFactor: true; challengeToken: string; expiresInSeconds: number };

// --- Financeiro ----------------------------------------------------------

export type ReceivablePeriod = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'year' | 'custom';

export interface InstallmentPreviewItem {
  installmentNumber: number;
  installmentTotal: number;
  value: number;
  dueDate: string;
}

export interface InstallmentPreview {
  totalValue: number;
  installments: InstallmentPreviewItem[];
  /** > 0 bloqueia a geração (o contrato já possui parcelas não canceladas). */
  existingCount: number;
  contractNumber: number;
}

export interface ReceivablesReport {
  period: { key: ReceivablePeriod; from: string; to: string };
  delinquency: {
    overdueCount: number;
    overdueTotal: number;
    contractsWithOverdue: number;
    maxDaysOverdue: number;
    averageDaysOverdue: number;
  };
  revenue: { received: number; expected: number; overdue: number };
  monthly: { month: string; received: number; expected: number; overdue: number }[];
  statusDistribution: { status: string; label: string; count: number; total: number; color: string }[];
  delinquencyTable: {
    data: {
      paymentId: string;
      clientName: string;
      contractId: string;
      contractNumber: number;
      installment: string;
      value: number;
      dueDate: string;
      daysOverdue: number;
      responsibleName: string;
    }[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  };
}
