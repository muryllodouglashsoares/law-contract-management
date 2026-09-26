import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicContractTemplate } from '../../shared/utils/serialize-contract-template';
import type {
  ContractTemplateIdParams,
  CreateContractTemplateBody,
  ListContractTemplatesQuery,
  UpdateContractTemplateBody,
} from './contract-template.schemas';
import { ContractTemplateService } from './contract-template.service';

const contractTemplateService = new ContractTemplateService(prisma);

export const contractTemplateController = {
  async list(request: FastifyRequest<{ Querystring: ListContractTemplatesQuery }>, reply: FastifyReply) {
    const result = await contractTemplateService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map(toPublicContractTemplate),
      pagination: result.pagination,
    });
  },

  async getById(request: FastifyRequest<{ Params: ContractTemplateIdParams }>, reply: FastifyReply) {
    const template = await contractTemplateService.getById(request.user.officeId, request.params.id);
    return reply.status(200).send({ template: toPublicContractTemplate(template) });
  },

  async create(request: FastifyRequest<{ Body: CreateContractTemplateBody }>, reply: FastifyReply) {
    const template = await contractTemplateService.create(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.body,
    );
    return reply.status(201).send({ template: toPublicContractTemplate(template) });
  },

  async update(
    request: FastifyRequest<{ Params: ContractTemplateIdParams; Body: UpdateContractTemplateBody }>,
    reply: FastifyReply,
  ) {
    const template = await contractTemplateService.update(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
      request.body,
    );
    return reply.status(200).send({ template: toPublicContractTemplate(template) });
  },

  async remove(request: FastifyRequest<{ Params: ContractTemplateIdParams }>, reply: FastifyReply) {
    await contractTemplateService.remove(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
    );
    return reply.status(204).send();
  },
};
