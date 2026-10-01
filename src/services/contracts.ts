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
  createSignatureLink: (id: string) => apiClient.post<SignatureLink>(`/contracts/${id}/signature-links`),
  listSignatures: (id: string) => apiClient.get<{ data: ContractSignatureRecord[] }>(`/contracts/${id}/signatures`),
};
