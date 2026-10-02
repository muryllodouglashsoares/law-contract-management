import { env } from '../../config/env';
import { prisma } from '../../shared/database/prisma';
import { createWebPushSender } from './push.sender';
import { PushService } from './push.service';

/** Instância única usada pela aplicação. Sem VAPID configurado, o Web Push fica desativado. */
export const pushService = new PushService(
  prisma,
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? createWebPushSender({
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      })
    : null,
  env.VAPID_PUBLIC_KEY ?? null,
);
