import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import type { ReceivablesQuery } from './dashboard.schemas';
import { DashboardService } from './dashboard.service';
import { ReceivablesService, resolvePeriod } from './receivables.service';

const dashboardService = new DashboardService(prisma);
const receivablesService = new ReceivablesService(prisma);

export const dashboardController = {
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const summary = await dashboardService.summary(request.user.officeId);
    return reply.status(200).send(summary);
  },

  async receivables(request: FastifyRequest<{ Querystring: ReceivablesQuery }>, reply: FastifyReply) {
    const { period, from, to, page, pageSize } = request.query;
    const officeId = request.user.officeId;
    const now = new Date();
    const range = resolvePeriod(period, now, { from, to });
    const [report, delinquency] = await Promise.all([
      receivablesService.report(officeId, period, range, now),
      receivablesService.delinquencyTable(officeId, page, pageSize, now),
    ]);
    return reply.status(200).send({ ...report, delinquencyTable: delinquency });
  },

  async exportReceivables(request: FastifyRequest<{ Querystring: ReceivablesQuery }>, reply: FastifyReply) {
    const { period, from, to, scope } = request.query;
    const range = resolvePeriod(period, new Date(), { from, to });
    const stream = receivablesService.exportCsv(request.user.officeId, { range, scope });
    reply.header('Content-Disposition', `attachment; filename="recebiveis_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv"`);
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.type('text/csv; charset=utf-8').send(stream);
  },
};
