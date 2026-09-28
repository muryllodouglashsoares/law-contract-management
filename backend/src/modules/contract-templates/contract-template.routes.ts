import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { requireRole } from '../../shared/auth/require-role';
import { validate } from '../../shared/http/validate';
import { contractTemplateController } from './contract-template.controller';
import {
  contractTemplateIdParamsSchema,
  createContractTemplateBodySchema,
  listContractTemplatesQuerySchema,
  updateContractTemplateBodySchema,
  type ContractTemplateIdParams,
  type CreateContractTemplateBody,
  type ListContractTemplatesQuery,
  type UpdateContractTemplateBody,
} from './contract-template.schemas';

export async function contractTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListContractTemplatesQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listContractTemplatesQuerySchema })] },
    contractTemplateController.list,
  );

  app.get<{ Params: ContractTemplateIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: contractTemplateIdParamsSchema })] },
    contractTemplateController.getById,
  );

  // Criar, editar e remover modelos de contrato é um ato jurídico (o texto
  // legal do modelo é reutilizado em todos os contratos gerados a partir
  // dele) — restrito a ADMIN/LAWYER. ASSISTANT mantém leitura (list/getById)
  // acima, necessária para apoiar a montagem de contratos.
  app.post<{ Body: CreateContractTemplateBody }>(
    '/',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ body: createContractTemplateBodySchema }),
      ],
    },
    contractTemplateController.create,
  );

  app.patch<{ Params: ContractTemplateIdParams; Body: UpdateContractTemplateBody }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractTemplateIdParamsSchema, body: updateContractTemplateBodySchema }),
      ],
    },
    contractTemplateController.update,
  );

  app.delete<{ Params: ContractTemplateIdParams }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        requireRole('ADMIN', 'LAWYER'),
        validate({ params: contractTemplateIdParamsSchema }),
      ],
    },
    contractTemplateController.remove,
  );
}
