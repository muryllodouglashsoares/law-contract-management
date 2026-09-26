import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { Client, ClientType } from '../types/api';

export interface ListClientsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'ativo' | 'inativo';
  type?: ClientType;
}

export interface ClientInput {
  type: ClientType;
  name: string;
  document: string;
  email: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const clientsService = {
  list: (params: ListClientsParams = {}) => apiClient.get<Paginated<Client>>('/clients', params),
  getById: (id: string) => apiClient.get<{ client: Client }>(`/clients/${id}`),
  create: (input: ClientInput) => apiClient.post<{ client: Client }>('/clients', input),
  update: (id: string, input: Partial<ClientInput & { status: 'ativo' | 'inativo' }>) =>
    apiClient.patch<{ client: Client }>(`/clients/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`/clients/${id}`),
};
