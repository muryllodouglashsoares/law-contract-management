import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { clientController } from './client.controller';
import {
  clientIdParamsSchema,
  createClientBodySchema,
  listClientsQuerySchema,
  updateClientBodySchema,
  type ClientIdParams,
  type CreateClientBody,
  type ListClientsQuery,
  type UpdateClientBody,
} from './client.schemas';

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListClientsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listClientsQuerySchema })] },
    clientController.list,
  );

  app.get<{ Params: ClientIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: clientIdParamsSchema })] },
    clientController.getById,
  );

  app.post<{ Body: CreateClientBody }>(
    '/',
    { preHandler: [authenticate, validate({ body: createClientBodySchema })] },
    clientController.create,
  );

  app.patch<{ Params: ClientIdParams; Body: UpdateClientBody }>(
    '/:id',
    {
      preHandler: [
        authenticate,
        validate({ params: clientIdParamsSchema, body: updateClientBodySchema }),
      ],
    },
    clientController.update,
  );

  app.delete<{ Params: ClientIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: clientIdParamsSchema })] },
    clientController.remove,
  );
}
