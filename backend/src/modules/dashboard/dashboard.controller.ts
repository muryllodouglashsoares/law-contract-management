import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { DashboardService } from './dashboard.service';

const dashboardService = new DashboardService(prisma);

export const dashboardController = {
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const summary = await dashboardService.summary(request.user.officeId);
    return reply.status(200).send(summary);
  },
};
