import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { Payment, PaymentMethodApi, PaymentStatusApi } from '../types/api';

export interface ListPaymentsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  contractId?: string;
  clientId?: string;
  status?: PaymentStatusApi;
}

export interface CreatePaymentInput {
  contractId: string;
  installmentNumber: number;
  installmentTotal: number;
  value: number;
  dueDate: string;
  notes?: string;
}

export const paymentsService = {
  summary: () => apiClient.get<{ totalPaid: number; totalPending: number; totalOverdue: number; receivableNext30Days: number }>('/payments/summary'),
  list: (params: ListPaymentsParams = {}) => apiClient.get<Paginated<Payment>>('/payments', params),
  getById: (id: string) => apiClient.get<{ payment: Payment }>(`/payments/${id}`),
  create: (input: CreatePaymentInput) => apiClient.post<{ payment: Payment }>('/payments', input),
  update: (id: string, input: Partial<Pick<CreatePaymentInput, 'value' | 'dueDate' | 'notes'>>) =>
    apiClient.patch<{ payment: Payment }>(`/payments/${id}`, input),
  registerPayment: (id: string, input: { method: PaymentMethodApi; paidAt?: string }) =>
    apiClient.post<{ payment: Payment }>(`/payments/${id}/register`, input),
};
