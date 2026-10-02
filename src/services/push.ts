import { apiClient } from '../lib/api-client';

export interface PushStatus {
  /** false = o servidor não tem as chaves VAPID (Web Push desativado). */
  configured: boolean;
  publicKey: string | null;
  /** Quantos dispositivos do usuário têm Web Push ativo. */
  subscriptionCount: number;
}

/** Formato de `PushSubscription.toJSON()`. */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushService = {
  status: () => apiClient.get<PushStatus>('/notifications/push/status'),
  subscribe: (subscription: PushSubscriptionPayload) =>
    apiClient.post<void>('/notifications/push/subscribe', subscription),
  unsubscribe: (endpoint: string) => apiClient.delete<void>('/notifications/push/subscribe', { endpoint }),
  /** Envia um push de teste aos dispositivos do próprio usuário. */
  test: () => apiClient.post<{ sent: number }>('/notifications/push/test'),
};
