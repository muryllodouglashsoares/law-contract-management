import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicUser } from '../../shared/utils/serialize-user';
import type { LoginBody } from './auth.schemas';
import { AuthService } from './auth.service';

const authService = new AuthService(prisma);

export const authController = {
  async login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
    const { email, password } = request.body;

    const user = await authService.login(email, password);

    const accessToken = await reply.jwtSign({
      userId: user.id,
      officeId: user.officeId,
      role: user.role,
    });

    return reply.status(200).send({
      accessToken,
      user: toPublicUser(user),
    });
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = await authService.getAuthenticatedUser(request.user.userId);

    return reply.status(200).send({ user: toPublicUser(user) });
  },
};
