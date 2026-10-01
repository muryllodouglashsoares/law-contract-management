import type { FastifyInstance } from 'fastify';

import type { RenewalJobResult } from '../contract-renewal/contract-renewal-job.service';
import { createCronAuth } from './cron-auth';

export interface RenewalJobRunner {
  run(now?: Date): Promise<RenewalJobResult>;
}

export interface InternalJobsRoutesOptions {
  cronSecret: string | undefined;
  renewalJob: RenewalJobRunner;
}

export const INTERNAL_JOB_RATE_LIMIT_MESSAGE = 'Muitas requisições. Tente novamente em instantes.';

export async function internalJobsRoutes(app: FastifyInstance, options: InternalJobsRoutesOptions): Promise<void> {
  const cronAuth = createCronAuth(options.cronSecret);

  // Somente POST. Rate limit baixo: o job roda 1x/dia; o limite existe para dificultar
  // tentativa de adivinhar o segredo (que já é longo e comparado em tempo constante).
  app.post(
    '/jobs/contract-renewal-alerts',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          errorResponseBuilder: (_request, context) => ({
            statusCode: context.statusCode,
            code: 'RATE_LIMIT_EXCEEDED',
            message: INTERNAL_JOB_RATE_LIMIT_MESSAGE,
          }),
        },
      },
      preHandler: [cronAuth],
    },
    async (_request, reply) => {
      const { processed, notified, skipped } = await options.renewalJob.run();
      // Resposta mínima: contagens apenas, nenhum dado de contrato/cliente.
      return reply.status(200).send({ status: 'ok', processed, notified, skipped });
    },
  );
}
