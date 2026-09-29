import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicUser } from '../../shared/utils/serialize-user';
import type {
  ChangePasswordBody,
  CreateUserBody,
  ListUsersQuery,
  UpdateMeBody,
  UpdateUserRoleBody,
  UpdateUserStatusBody,
  UserIdParams,
} from './user.schemas';
import { UserService } from './user.service';

const userService = new UserService(prisma);

/** O tenant vem SEMPRE da sessão (request.user), nunca do body/query/params. */
const actorOf = (request: FastifyRequest) => ({
  userId: request.user.userId,
  officeId: request.user.officeId,
});

export const userController = {
  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = await userService.getById(request.user.userId);
    return reply.status(200).send({ user: toPublicUser(user) });
  },

  async updateMe(request: FastifyRequest<{ Body: UpdateMeBody }>, reply: FastifyReply) {
    const user = await userService.updateMe(request.user.userId, request.body);
    return reply.status(200).send({ user: toPublicUser(user) });
  },

  async changePassword(request: FastifyRequest<{ Body: ChangePasswordBody }>, reply: FastifyReply) {
    await userService.changePassword(request.user.userId, request.body);
    return reply.status(204).send();
  },

  async list(request: FastifyRequest<{ Querystring: ListUsersQuery }>, reply: FastifyReply) {
    const result = await userService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map(toPublicUser),
      pagination: result.pagination,
    });
  },

  async getById(request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) {
    const user = await userService.getInOffice(request.user.officeId, request.params.id);
    return reply.status(200).send({ user: toPublicUser(user) });
  },

  async create(request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) {
    const { user, temporaryPassword } = await userService.create(actorOf(request), request.body);
    // A senha provisória só existe nesta resposta; não é persistida em texto nem logada.
    reply.header('Cache-Control', 'no-store');
    return reply.status(201).send({ user: toPublicUser(user), temporaryPassword });
  },

  async updateRole(
    request: FastifyRequest<{ Params: UserIdParams; Body: UpdateUserRoleBody }>,
    reply: FastifyReply,
  ) {
    const user = await userService.updateRole(actorOf(request), request.params.id, request.body.role);
    return reply.status(200).send({ user: toPublicUser(user) });
  },

  async updateStatus(
    request: FastifyRequest<{ Params: UserIdParams; Body: UpdateUserStatusBody }>,
    reply: FastifyReply,
  ) {
    const user = await userService.updateStatus(actorOf(request), request.params.id, request.body.status);
    return reply.status(200).send({ user: toPublicUser(user) });
  },
};
