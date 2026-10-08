import type { FastifyInstance } from 'fastify';

import type { RenewalJobResult } from '../contract-renewal/contract-renewal-job.service';
import { createCronAuth } from './cron-auth';

export interface RenewalJobRunner {
  run(now?: Date): Promise<RenewalJobResult>;
}

/** Contrato comum dos jobs: contagens apenas (nenhum dado de contrato/cliente na resposta). */
export interface CountingJobRunner {
  run(now?: Date): Promise<{ processed: number; notified: number; skipped: number; enabled?: boolean }>;
}

export interface InternalJobsRoutesOptions {
  cronSecret: string | undefined;
  renewalJob: RenewalJobRunner;
  paymentAlertsJob?: CountingJobRunner;
  signatureAlertsJob?: CountingJobRunner;
}

export const INTERNAL_JOB_RATE_LIMIT_MESSAGE = 'Muitas requisições. Tente novamente em instantes.';

export async function internalJobsRoutes(app: FastifyInstance, options: InternalJobsRoutesOptions): Promise<void> {
  const cronAuth = createCronAuth(options.cronSecret);

  // Somente POST. Rate limit baixo: cada job roda 1x/dia; o limite existe para dificultar
  // tentativa de adivinhar o segredo (que já é longo e comparado em tempo constante).
  const register = (path: string, runner: CountingJobRunner | undefined) => {
    if (!runner) return;
    app.post(
      path,
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
        const { processed, notified, skipped, enabled } = await runner.run();
        return reply.status(200).send({ status: 'ok', processed, notified, skipped, ...(enabled === false ? { enabled } : {}) });
      },
    );
  };

  register('/jobs/contract-renewal-alerts', options.renewalJob);
  register('/jobs/payment-due-alerts', options.paymentAlertsJob);
  register('/jobs/signature-link-alerts', options.signatureAlertsJob);
}
