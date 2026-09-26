import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicOffice } from '../../shared/utils/serialize-office';
import type { UpdateOfficeBody } from './office.schemas';
import { OfficeService } from './office.service';

const officeService = new OfficeService(prisma);

export const officeController = {
  async me(request: FastifyRequest, reply: FastifyReply) {
    const office = await officeService.getById(request.user.officeId);
    return reply.status(200).send({ office: toPublicOffice(office) });
  },

  async updateMe(request: FastifyRequest<{ Body: UpdateOfficeBody }>, reply: FastifyReply) {
    const office = await officeService.update(request.user.officeId, request.body);
    return reply.status(200).send({ office: toPublicOffice(office) });
  },
};
