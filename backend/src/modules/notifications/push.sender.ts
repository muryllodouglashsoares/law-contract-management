import webpush from 'web-push';

import type { PushSubscriptionTarget, WebPushSender } from './push.types';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Tempo máximo de guarda no serviço de push se o dispositivo estiver offline (24 h). */
const TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Único ponto do sistema que chama `web-push`. As credenciais VAPID são passadas por
 * requisição (não via setVapidDetails global), então nada fica em estado de módulo.
 * Em falha, a biblioteca lança `WebPushError` com `statusCode` (404/410 = subscription morta).
 */
export function createWebPushSender(vapid: VapidConfig): WebPushSender {
  const vapidDetails = { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };

  return {
    async send(target: PushSubscriptionTarget, payload: string): Promise<void> {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { vapidDetails, TTL: TTL_SECONDS, urgency: 'normal', timeout: REQUEST_TIMEOUT_MS },
      );
    },
  };
}
