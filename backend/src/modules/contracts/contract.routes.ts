import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { requireRole } from '../../shared/auth/require-role';
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

  // Criar, editar e mudar o status de um contrato (enviar, assinar, ativar,
  // encerrar...) é o núcleo do trabalho jurídico — restrito a ADMIN/LAWYER.
  // ASSISTANT mantém leitura (list/getById/versions) acima, necessária para
  // acompanhar o andamento dos contratos no fluxo do escritório.
  app.post<{ Body: CreateContractBody }>(
    '/',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'LAWYER'), validate({ body: createContractBodySchema })],
    },
    contractController.create,
  );

  app.patch<{ Params: ContractIdParams; Body: UpdateContractBody }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
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
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractIdParamsSchema, body: updateContractStatusBodySchema }),
      ],
    },
    contractController.updateStatus,
  );
}
