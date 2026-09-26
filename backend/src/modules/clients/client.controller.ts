import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicClient } from '../../shared/utils/serialize-client';
import type {
  ClientIdParams,
  CreateClientBody,
  ListClientsQuery,
  UpdateClientBody,
} from './client.schemas';
import { ClientService } from './client.service';

const clientService = new ClientService(prisma);

export const clientController = {
  async list(request: FastifyRequest<{ Querystring: ListClientsQuery }>, reply: FastifyReply) {
    const result = await clientService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map(toPublicClient),
      pagination: result.pagination,
    });
  },

  async getById(request: FastifyRequest<{ Params: ClientIdParams }>, reply: FastifyReply) {
    const client = await clientService.getById(request.user.officeId, request.params.id);
    return reply.status(200).send({ client: toPublicClient(client) });
  },

  async create(request: FastifyRequest<{ Body: CreateClientBody }>, reply: FastifyReply) {
    const client = await clientService.create(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.body,
    );
    return reply.status(201).send({ client: toPublicClient(client) });
  },

  async update(
    request: FastifyRequest<{ Params: ClientIdParams; Body: UpdateClientBody }>,
    reply: FastifyReply,
  ) {
    const client = await clientService.update(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
      request.body,
    );
    return reply.status(200).send({ client: toPublicClient(client) });
  },

  async remove(request: FastifyRequest<{ Params: ClientIdParams }>, reply: FastifyReply) {
    await clientService.remove(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
    );
    return reply.status(204).send();
  },
};
