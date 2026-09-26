import { apiClient } from '../lib/api-client';
import type { User } from '../types/api';

export interface UpdateMeInput {
  name?: string;
  phone?: string;
  oabNumber?: string;
}

export const usersService = {
  getMe: () => apiClient.get<{ user: User }>('/users/me'),
  updateMe: (input: UpdateMeInput) => apiClient.patch<{ user: User }>('/users/me', input),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiClient.patch<void>('/users/me/password', input),
};
