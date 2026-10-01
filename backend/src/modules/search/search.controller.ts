import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import type { GlobalSearchQuery } from './search.schemas';
import { SearchService } from './search.service';

const searchService = new SearchService(prisma);

export const searchController = {
  async global(request: FastifyRequest<{ Querystring: GlobalSearchQuery }>, reply: FastifyReply) {
    // officeId e role vêm SEMPRE do usuário autenticado (request.user), nunca da query.
    const results = await searchService.searchGlobal(
      { officeId: request.user.officeId, role: request.user.role },
      request.query.q,
      request.query.limit,
    );
    reply.header('Cache-Control', 'no-store');
    return reply.status(200).send({ results });
  },
};
