import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

const paymentMethodApiSchema = z.enum(['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão']);
const paymentDisplayStatusSchema = z.enum(['pendente', 'pago', 'atrasado', 'futuro', 'cancelado']);

export const createPaymentBodySchema = z
  .object({
    contractId: z.string().uuid('Contrato inválido'),
    installmentNumber: z.number().int().positive(),
    installmentTotal: z.number().int().positive(),
    value: z.number().positive('Valor deve ser maior que zero'),
    dueDate: z.coerce.date({ message: 'Data de vencimento inválida' }),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.installmentNumber <= data.installmentTotal, {
    message: 'Número da parcela não pode ser maior que o total de parcelas',
    path: ['installmentNumber'],
  });
export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;

export const updatePaymentBodySchema = z
  .object({
    value: z.number().positive().optional(),
    dueDate: z.coerce.date().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });
export type UpdatePaymentBody = z.infer<typeof updatePaymentBodySchema>;

export const registerPaymentBodySchema = z.object({
  method: paymentMethodApiSchema,
  paidAt: z.coerce.date().optional(),
});
export type RegisterPaymentBody = z.infer<typeof registerPaymentBodySchema>;

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  contractId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  status: paymentDisplayStatusSchema.optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentIdParamsSchema = z.object({ id: z.string().uuid('ID de pagamento inválido') });
export type PaymentIdParams = z.infer<typeof paymentIdParamsSchema>;
