import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { searchController } from './search.controller';
import { globalSearchQuerySchema, type GlobalSearchQuery } from './search.schemas';

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: GlobalSearchQuery }>(
    '/global',
    { preHandler: [authenticate, validate({ querystring: globalSearchQuerySchema })] },
    searchController.global,
  );
}
