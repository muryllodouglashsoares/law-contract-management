import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { ContractTemplate, TemplateStatusApi } from '../types/api';

export interface ListTemplatesParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: TemplateStatusApi;
}

export interface TemplateInput {
  name: string;
  description?: string;
  content: string;
  status?: TemplateStatusApi;
}

export const templatesService = {
  list: (params: ListTemplatesParams = {}) =>
    apiClient.get<Paginated<ContractTemplate>>('/contract-templates', params),
  getById: (id: string) => apiClient.get<{ template: ContractTemplate }>(`/contract-templates/${id}`),
  create: (input: TemplateInput) => apiClient.post<{ template: ContractTemplate }>('/contract-templates', input),
  update: (id: string, input: Partial<TemplateInput>) =>
    apiClient.patch<{ template: ContractTemplate }>(`/contract-templates/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`/contract-templates/${id}`),
};
