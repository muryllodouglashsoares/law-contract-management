import { apiClient } from '../lib/api-client';
import type { Office } from '../types/api';

export interface UpdateOfficeInput {
  name?: string;
  phone?: string;
  address?: string;
  specialties?: string;
  requireInternalApproval?: boolean;
}

export const officesService = {
  getMe: () => apiClient.get<{ office: Office }>('/offices/me'),
  updateMe: (input: UpdateOfficeInput) => apiClient.patch<{ office: Office }>('/offices/me', input),
};
