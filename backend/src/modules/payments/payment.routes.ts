import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { paymentController } from './payment.controller';
import {
  createPaymentBodySchema,
  generateInstallmentsBodySchema,
  type GenerateInstallmentsBody,
  listPaymentsQuerySchema,
  paymentIdParamsSchema,
  registerPaymentBodySchema,
  updatePaymentBodySchema,
  type CreatePaymentBody,
  type ListPaymentsQuery,
  type PaymentIdParams,
  type RegisterPaymentBody,
  type UpdatePaymentBody,
} from './payment.schemas';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summary', { preHandler: [authenticate] }, paymentController.summary);

  // Parcelamento automático. Rotas estáticas ANTES de '/:id'. Mesmo nível de permissão de criar parcela.
  app.post<{ Body: GenerateInstallmentsBody }>(
    '/installments/preview',
    { preHandler: [authenticate, validate({ body: generateInstallmentsBodySchema })] },
    paymentController.previewInstallments,
  );

  app.post<{ Body: GenerateInstallmentsBody }>(
    '/installments/generate',
    { preHandler: [authenticate, validate({ body: generateInstallmentsBodySchema })] },
    paymentController.generateInstallments,
  );

  app.get<{ Querystring: ListPaymentsQuery }>(
    '/',
    { preHandler: [authenticate, validate({ querystring: listPaymentsQuerySchema })] },
    paymentController.list,
  );

  app.get<{ Params: PaymentIdParams }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: paymentIdParamsSchema })] },
    paymentController.getById,
  );

  app.post<{ Body: CreatePaymentBody }>(
    '/',
    { preHandler: [authenticate, validate({ body: createPaymentBodySchema })] },
    paymentController.create,
  );

  app.patch<{ Params: PaymentIdParams; Body: UpdatePaymentBody }>(
    '/:id',
    { preHandler: [authenticate, validate({ params: paymentIdParamsSchema, body: updatePaymentBodySchema })] },
    paymentController.update,
  );

  app.post<{ Params: PaymentIdParams; Body: RegisterPaymentBody }>(
    '/:id/register',
    {
      preHandler: [
        authenticate,
        validate({ params: paymentIdParamsSchema, body: registerPaymentBodySchema }),
      ],
    },
    paymentController.registerPayment,
  );
}
