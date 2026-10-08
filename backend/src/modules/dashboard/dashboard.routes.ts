import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { dashboardController } from './dashboard.controller';
import { receivablesQuerySchema, type ReceivablesQuery } from './dashboard.schemas';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summary', { preHandler: [authenticate] }, dashboardController.summary);

  // Financeiro (inadimplência e receita): todo o cálculo é do backend, sempre pelo officeId da sessão.
  app.get<{ Querystring: ReceivablesQuery }>(
    '/receivables',
    { preHandler: [authenticate, validate({ querystring: receivablesQuerySchema })] },
    dashboardController.receivables,
  );

  app.get<{ Querystring: ReceivablesQuery }>(
    '/receivables/export',
    { preHandler: [authenticate, validate({ querystring: receivablesQuerySchema })] },
    dashboardController.exportReceivables,
  );
}
