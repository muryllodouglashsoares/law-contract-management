import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import { notifyNotificationsChanged } from '../lib/notifications-events';
import type { AppNotification } from '../types/api';

export interface ListNotificationsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  read?: boolean;
}

export const notificationsService = {
  /** `unreadCount` é o total REAL de não lidas do usuário (fonte oficial, independe da paginação). */
  list: (params: ListNotificationsParams = {}) =>
    apiClient.get<Paginated<AppNotification> & { unreadCount: number }>('/notifications', params),

  /** Depois de marcar com sucesso, avisa (evento local) quem mostra o contador — ex.: menu/topbar. */
  markRead: async (id: string) => {
    const result = await apiClient.patch<{ notification: AppNotification }>(`/notifications/${id}/read`);
    notifyNotificationsChanged();
    return result;
  },
  markAllRead: async () => {
    await apiClient.patch<void>('/notifications/read-all');
    notifyNotificationsChanged();
  },
};
