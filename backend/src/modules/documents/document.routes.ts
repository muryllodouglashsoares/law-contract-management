import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { documentController } from './document.controller';
import {
  documentIdParamsSchema,
  listDocumentsQuerySchema,
  type DocumentIdParams,
  type ListDocumentsQuery,
} from './document.schemas';

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListDocumentsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listDocumentsQuerySchema })] },
    documentController.list,
  );

  app.get<{ Params: DocumentIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: documentIdParamsSchema })] },
    documentController.getById,
  );

  app.get<{ Params: DocumentIdParams }>(
    '/:id/download',
    { preHandler: [authenticate, validate({ params: documentIdParamsSchema })] },
    documentController.download,
  );

  // Upload é multipart/form-data — sem schema JSON de body (ver document.controller.ts).
  app.post('/', { preHandler: [authenticate] }, documentController.upload);

  app.delete<{ Params: DocumentIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: documentIdParamsSchema })] },
    documentController.remove,
  );
}
