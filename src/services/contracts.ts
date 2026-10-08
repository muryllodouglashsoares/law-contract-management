import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type {
  AppDocument,
  Contract,
  ContractSignatureRecord,
  ContractStatusApi,
  ContractVersion,
  SignatureLink,
} from '../types/api';

export interface ListContractsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ContractStatusApi;
  clientId?: string;
  /** Filtros avançados (datas em YYYY-MM-DD; valores em reais). */
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  valueMin?: number;
  valueMax?: number;
}

export interface CreateContractInput {
  clientId: string;
  templateId: string;
  value: number;
  object: string;
  startDate: string;
  endDate?: string;
  termText?: string;
  conditions?: string;
}

export const contractsService = {
  list: (params: ListContractsParams = {}) => apiClient.get<Paginated<Contract>>('/contracts', params),
  getById: (id: string) => apiClient.get<{ contract: Contract }>(`/contracts/${id}`),
  listVersions: (id: string) => apiClient.get<{ data: ContractVersion[] }>(`/contracts/${id}/versions`),
  create: (input: CreateContractInput) => apiClient.post<{ contract: Contract }>('/contracts', input),
  /** `endDate: null` remove a data de término. */
  update: (id: string, input: Partial<Omit<CreateContractInput, 'endDate'>> & { endDate?: string | null }) =>
    apiClient.patch<{ contract: Contract }>(`/contracts/${id}`, input),
  updateStatus: (id: string, status: ContractStatusApi) =>
    apiClient.patch<{ contract: Contract }>(`/contracts/${id}/status`, { status }),
  /** Gera (ou reaproveita) o PDF de uma versão do contrato. Sem `versionNumber`,
   * usa a versão atual. O conteúdo do PDF vem sempre do backend. */
  generatePdf: (id: string, versionNumber?: number) =>
    apiClient.post<{ document: AppDocument; created: boolean }>(
      `/contracts/${id}/pdf`,
      versionNumber !== undefined ? { versionNumber } : undefined,
    ),
  /** Gera um link público de uso único para aceite eletrônico (ADMIN/LAWYER). O link só é devolvido nesta resposta. */
  createSignatureLink: (id: string, options: { sendEmail?: boolean } = {}) =>
    apiClient.post<SignatureLink>(`/contracts/${id}/signature-links`, options.sendEmail ? { sendEmail: true } : undefined),
  listSignatures: (id: string) => apiClient.get<{ data: ContractSignatureRecord[] }>(`/contracts/${id}/signatures`),
  /** Renovação em um clique (ADMIN/LAWYER): cria nova versão e reinicia os alertas de renovação. */
  renew: (id: string, input: { newEndDate: string; adjustmentPercent?: number }) =>
    apiClient.post<{ contract: Contract }>(`/contracts/${id}/renew`, input),

  // Revisão interna (aprovação)
  submitReview: (id: string) => apiClient.post<{ contract: Contract }>(`/contracts/${id}/submit-review`),
  approve: (id: string) => apiClient.post<{ contract: Contract }>(`/contracts/${id}/approve`),
  reject: (id: string, reason: string) => apiClient.post<{ contract: Contract }>(`/contracts/${id}/reject`, { reason }),

  /** PDF FINAL com o comprovante de aceite (gerado sob demanda se necessário). */
  async downloadSignedPdf(id: string, suggestedFileName: string): Promise<void> {
    const { blob, fileName } = await apiClient.downloadBlob(`/contracts/${id}/signed-pdf`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName ?? suggestedFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
