/**
 * Tipos que espelham exatamente os DTOs (`Public*`) devolvidos pela API do
 * backend (ver backend/src/shared/utils/serialize-*.ts). Mantidos aqui em
 * vez de `any`/inferência solta para que o TypeScript detecte divergências
 * entre frontend e backend em tempo de compilação.
 */

export type UserRole = 'ADMIN' | 'LAWYER' | 'ASSISTANT';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  oabNumber: string | null;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Office {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string;
  address: string | null;
  specialties: string | null;
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
  termText: string | null;
  conditions: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; document: string; email: string };
  template: { id: string; name: string };
  responsible: { id: string; name: string };
  currentVersion: { versionNumber: number; content: string; createdAt: string } | null;
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
