import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { NotificationPreferences, User, UserRole, UserStatus } from '../types/api';

export interface UpdateMeInput {
  name?: string;
  phone?: string;
  oabNumber?: string;
}

export interface ListUsersParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  oabNumber?: string;
}

export interface CreatedUser {
  user: User;
  /** Exibida uma única vez: o backend guarda apenas o hash. */
  temporaryPassword: string;
}

export const usersService = {
  getMe: () => apiClient.get<{ user: User }>('/users/me'),
  updateMe: (input: UpdateMeInput) => apiClient.patch<{ user: User }>('/users/me', input),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiClient.patch<void>('/users/me/password', input),

  getNotificationPreferences: () =>
    apiClient.get<{ preferences: NotificationPreferences }>('/users/me/notification-preferences'),
  updateNotificationPreferences: (input: Partial<NotificationPreferences>) =>
    apiClient.patch<{ preferences: NotificationPreferences }>('/users/me/notification-preferences', input),

  // Gestão de usuários (ADMIN) — o escritório é sempre o da sessão, definido pelo backend.
  list: (params: ListUsersParams = {}) => apiClient.get<Paginated<User>>('/users', params),
  create: (input: CreateUserInput) => apiClient.post<CreatedUser>('/users', input),
  updateRole: (id: string, role: UserRole) => apiClient.patch<{ user: User }>(`/users/${id}/role`, { role }),
  updateStatus: (id: string, status: UserStatus) =>
    apiClient.patch<{ user: User }>(`/users/${id}/status`, { status }),
};
