import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { dashboardController } from './dashboard.controller';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summary', { preHandler: [authenticate] }, dashboardController.summary);
}
