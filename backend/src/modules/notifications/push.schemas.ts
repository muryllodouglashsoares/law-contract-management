import { z } from 'zod';

import { isAllowedPushEndpoint } from './push.service';

/** Mesmo formato de `PushSubscription.toJSON()` do navegador (campos extras são descartados). */
export const subscribePushBodySchema = z.object({
  endpoint: z
    .string()
    .max(2048, 'Endpoint de push inválido')
    .refine(isAllowedPushEndpoint, 'Endpoint de push inválido'),
  keys: z.object({
    // Chave pública P-256 (65 bytes) e segredo de autenticação (16 bytes), em base64url sem padding.
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/, 'Chave p256dh inválida'),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/, 'Chave auth inválida'),
  }),
});
export type SubscribePushBody = z.infer<typeof subscribePushBodySchema>;

export const unsubscribePushBodySchema = z.object({
  endpoint: z.string().min(1, 'Endpoint obrigatório').max(2048, 'Endpoint de push inválido'),
});
export type UnsubscribePushBody = z.infer<typeof unsubscribePushBodySchema>;
