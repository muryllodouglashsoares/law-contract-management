import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';
import { MAX_INSTALLMENTS, toCents } from '../../shared/utils/installments';
import { isValidPixPayload } from '../../shared/utils/pix';

const paymentMethodApiSchema = z.enum(['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão']);
/** Pix copia e cola (BR Code) — nullable para permitir remover. A baixa NUNCA é automática. */
const pixCodeSchema = z
  .string()
  .trim()
  .refine(isValidPixPayload, { message: 'Código Pix inválido. Cole o "copia e cola" completo, exatamente como gerado pelo banco.' });
const pixFields = {
  pixCode: pixCodeSchema.nullable().optional(),
  pixKey: z.string().trim().max(140).nullable().optional(),
  pixInstructions: z.string().trim().max(500).nullable().optional(),
};

const paymentDisplayStatusSchema = z.enum(['pendente', 'pago', 'atrasado', 'futuro', 'cancelado']);

export const createPaymentBodySchema = z
  .object({
    contractId: z.string().uuid('Contrato inválido'),
    installmentNumber: z.number().int().positive(),
    installmentTotal: z.number().int().positive(),
    value: z.number().positive('Valor deve ser maior que zero'),
    dueDate: z.coerce.date({ message: 'Data de vencimento inválida' }),
    notes: z.string().trim().max(1000).optional(),
    ...pixFields,
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
    ...pixFields,
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

/** Geração automática de parcelas. Valores monetários com no máx. 2 casas; cálculo em centavos. */
export const generateInstallmentsBodySchema = z.object({
  contractId: z.string().uuid('Contrato inválido'),
  totalValue: z
    .number({ message: 'Valor total inválido' })
    .refine((value) => toCents(value) !== null, { message: 'Informe um valor total maior que zero, com no máximo 2 casas decimais' }),
  installmentCount: z
    .number({ message: 'Número de parcelas inválido' })
    .int('Número de parcelas inválido')
    .min(1, 'Informe ao menos 1 parcela')
    .max(MAX_INSTALLMENTS, `No máximo ${MAX_INSTALLMENTS} parcelas`),
  firstDueDate: z.coerce.date({ message: 'Data do primeiro vencimento inválida' }),
});
export type GenerateInstallmentsBody = z.infer<typeof generateInstallmentsBodySchema>;
