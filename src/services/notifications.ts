import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { AppNotification } from '../types/api';

export interface ListNotificationsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  read?: boolean;
}

export const notificationsService = {
  list: (params: ListNotificationsParams = {}) =>
    apiClient.get<Paginated<AppNotification> & { unreadCount: number }>('/notifications', params),
  markRead: (id: string) => apiClient.patch<{ notification: AppNotification }>(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch<void>('/notifications/read-all'),
};
