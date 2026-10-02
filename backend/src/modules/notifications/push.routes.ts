import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { pushController } from './push.controller';
import {
  subscribePushBodySchema,
  unsubscribePushBodySchema,
  type SubscribePushBody,
  type UnsubscribePushBody,
} from './push.schemas';

/**
 * Montado em `/notifications/push`. Todas as rotas exigem JWT e operam SOMENTE sobre as
 * subscriptions do próprio usuário autenticado — não existe rota para enviar push a terceiros;
 * o envio acontece apenas a partir de eventos do backend (contrato assinado, cron de renovação).
 */
export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', { preHandler: [authenticate] }, pushController.status);

  app.post<{ Body: SubscribePushBody }>(
    '/subscribe',
    { preHandler: [authenticate, validate({ body: subscribePushBodySchema })] },
    pushController.subscribe,
  );

  app.delete<{ Body: UnsubscribePushBody }>(
    '/subscribe',
    { preHandler: [authenticate, validate({ body: unsubscribePushBodySchema })] },
    pushController.unsubscribe,
  );

  // Teste só para os próprios dispositivos; limitado para não virar canal de spam.
  app.post(
    '/test',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, preHandler: [authenticate] },
    pushController.test,
  );
}
