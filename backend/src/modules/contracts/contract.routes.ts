import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { contractController } from './contract.controller';
import {
  contractIdParamsSchema,
  createContractBodySchema,
  listContractsQuerySchema,
  updateContractBodySchema,
  updateContractStatusBodySchema,
  type ContractIdParams,
  type CreateContractBody,
  type ListContractsQuery,
  type UpdateContractBody,
  type UpdateContractStatusBody,
} from './contract.schemas';

export async function contractRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListContractsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listContractsQuerySchema })] },
    contractController.list,
  );

  app.get<{ Params: ContractIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: contractIdParamsSchema })] },
    contractController.getById,
  );

  app.get<{ Params: ContractIdParams }>(
    '/:id/versions',
    { preHandler: [authenticate, validate({ params: contractIdParamsSchema })] },
    contractController.listVersions,
  );

  app.post<{ Body: CreateContractBody }>(
    '/',
    { preHandler: [authenticate, validate({ body: createContractBodySchema })] },
    contractController.create,
  );

  app.patch<{ Params: ContractIdParams; Body: UpdateContractBody }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        validate({ params: contractIdParamsSchema, body: updateContractBodySchema }),
      ],
    },
    contractController.update,
  );

  app.patch<{ Params: ContractIdParams; Body: UpdateContractStatusBody }>(
    '/:id/status',
    {
      preHandler: [
        authenticate,
        validate({ params: contractIdParamsSchema, body: updateContractStatusBodySchema }),
      ],
    },
    contractController.updateStatus,
  );
}
