import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { InstallmentPreview, Payment, PaymentMethodApi, PaymentStatusApi } from '../types/api';

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
  pixCode?: string | null;
  pixKey?: string | null;
  pixInstructions?: string | null;
}

export interface GenerateInstallmentsInput {
  contractId: string;
  totalValue: number;
  installmentCount: number;
  firstDueDate: string;
}

export interface UpdatePaymentInput extends Partial<Pick<CreatePaymentInput, 'value' | 'dueDate' | 'notes'>> {
  pixCode?: string | null;
  pixKey?: string | null;
  pixInstructions?: string | null;
}

export const paymentsService = {
  summary: () => apiClient.get<{ totalPaid: number; totalPending: number; totalOverdue: number; receivableNext30Days: number }>('/payments/summary'),
  list: (params: ListPaymentsParams = {}) => apiClient.get<Paginated<Payment>>('/payments', params),
  getById: (id: string) => apiClient.get<{ payment: Payment }>(`/payments/${id}`),
  create: (input: CreatePaymentInput) => apiClient.post<{ payment: Payment }>('/payments', input),
  /** Prévia calculada pelo BACKEND (centavos exatos, vencimentos com dia preservado). Não grava nada. */
  previewInstallments: (input: GenerateInstallmentsInput) =>
    apiClient.post<InstallmentPreview>('/payments/installments/preview', input),
  generateInstallments: (input: GenerateInstallmentsInput) =>
    apiClient.post<{ data: Payment[] }>('/payments/installments/generate', input),
  update: (id: string, input: UpdatePaymentInput) =>
    apiClient.patch<{ payment: Payment }>(`/payments/${id}`, input),
  registerPayment: (id: string, input: { method: PaymentMethodApi; paidAt?: string }) =>
    apiClient.post<{ payment: Payment }>(`/payments/${id}/register`, input),
};
