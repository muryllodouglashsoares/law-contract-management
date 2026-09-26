import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicContract } from '../../shared/utils/serialize-contract';
import type {
  ContractIdParams,
  CreateContractBody,
  ListContractsQuery,
  UpdateContractBody,
  UpdateContractStatusBody,
} from './contract.schemas';
import { ContractService } from './contract.service';

const contractService = new ContractService(prisma);

export const contractController = {
  async list(request: FastifyRequest<{ Querystring: ListContractsQuery }>, reply: FastifyReply) {
    const result = await contractService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map(toPublicContract),
      pagination: result.pagination,
    });
  },

  async getById(request: FastifyRequest<{ Params: ContractIdParams }>, reply: FastifyReply) {
    const contract = await contractService.getById(request.user.officeId, request.params.id);
    return reply.status(200).send({ contract: toPublicContract(contract) });
  },

  async listVersions(request: FastifyRequest<{ Params: ContractIdParams }>, reply: FastifyReply) {
    const versions = await contractService.listVersions(request.user.officeId, request.params.id);
    return reply.status(200).send({
      data: versions.map((v) => ({
        versionNumber: v.versionNumber,
        content: v.content,
        author: v.author,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  },

  async create(request: FastifyRequest<{ Body: CreateContractBody }>, reply: FastifyReply) {
    const contract = await contractService.create(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.body,
    );
    return reply.status(201).send({ contract: toPublicContract(contract) });
  },

  async update(
    request: FastifyRequest<{ Params: ContractIdParams; Body: UpdateContractBody }>,
    reply: FastifyReply,
  ) {
    const contract = await contractService.update(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
      request.body,
    );
    return reply.status(200).send({ contract: toPublicContract(contract) });
  },

  async updateStatus(
    request: FastifyRequest<{ Params: ContractIdParams; Body: UpdateContractStatusBody }>,
    reply: FastifyReply,
  ) {
    const contract = await contractService.updateStatus(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
      request.body.status,
    );
    return reply.status(200).send({ contract: toPublicContract(contract) });
  },
};
