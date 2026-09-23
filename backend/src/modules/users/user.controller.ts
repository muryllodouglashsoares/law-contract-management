import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicUser } from '../../shared/utils/serialize-user';
import type { UpdateMeBody } from './user.schemas';
import { UserService } from './user.service';

const userService = new UserService(prisma);

export const userController = {
  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = await userService.getById(request.user.userId);
    return reply.status(200).send({ user: toPublicUser(user) });
  },

  async updateMe(request: FastifyRequest<{ Body: UpdateMeBody }>, reply: FastifyReply) {
    const user = await userService.updateMe(request.user.userId, request.body);
    return reply.status(200).send({ user: toPublicUser(user) });
  },
};
