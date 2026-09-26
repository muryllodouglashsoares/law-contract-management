import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { Contract, ContractStatusApi, ContractVersion } from '../types/api';

export interface ListContractsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ContractStatusApi;
  clientId?: string;
}

export interface CreateContractInput {
  clientId: string;
  templateId: string;
  value: number;
  object: string;
  startDate: string;
  termText?: string;
  conditions?: string;
}

export const contractsService = {
  list: (params: ListContractsParams = {}) => apiClient.get<Paginated<Contract>>('/contracts', params),
  getById: (id: string) => apiClient.get<{ contract: Contract }>(`/contracts/${id}`),
  listVersions: (id: string) => apiClient.get<{ data: ContractVersion[] }>(`/contracts/${id}/versions`),
  create: (input: CreateContractInput) => apiClient.post<{ contract: Contract }>('/contracts', input),
  update: (id: string, input: Partial<CreateContractInput>) =>
    apiClient.patch<{ contract: Contract }>(`/contracts/${id}`, input),
  updateStatus: (id: string, status: ContractStatusApi) =>
    apiClient.patch<{ contract: Contract }>(`/contracts/${id}/status`, { status }),
};
