import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

export const contractStatusApiSchema = z.enum([
  'rascunho',
  'pronto_envio',
  'enviado',
  'em_revisao',
  'assinado',
  'ativo',
  'encerrado',
  'cancelado',
]);

export const createContractBodySchema = z.object({
  clientId: z.string().uuid('Cliente inválido'),
  templateId: z.string().uuid('Modelo inválido'),
  value: z.number().positive('Valor deve ser maior que zero'),
  object: z.string().trim().min(3, 'Descreva o objeto do contrato').max(2000),
  startDate: z.coerce.date({ message: 'Data de início inválida' }),
  termText: z.string().trim().max(100).optional(),
  conditions: z.string().trim().max(4000).optional(),
});
export type CreateContractBody = z.infer<typeof createContractBodySchema>;

export const updateContractBodySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    value: z.number().positive().optional(),
    object: z.string().trim().min(3).max(2000).optional(),
    startDate: z.coerce.date().optional(),
    termText: z.string().trim().max(100).optional(),
    conditions: z.string().trim().max(4000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });
export type UpdateContractBody = z.infer<typeof updateContractBodySchema>;

export const updateContractStatusBodySchema = z.object({
  status: contractStatusApiSchema,
});
export type UpdateContractStatusBody = z.infer<typeof updateContractStatusBodySchema>;

export const listContractsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: contractStatusApiSchema.optional(),
  clientId: z.string().uuid().optional(),
});
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

export const contractIdParamsSchema = z.object({ id: z.string().uuid('ID de contrato inválido') });
export type ContractIdParams = z.infer<typeof contractIdParamsSchema>;

/** Body opcional: sem `versionNumber`, gera o PDF da versão atual. */
export const generateContractPdfBodySchema = z
  .object({ versionNumber: z.number().int().positive('Versão inválida').optional() })
  .optional();
export type GenerateContractPdfBody = z.infer<typeof generateContractPdfBodySchema>;
