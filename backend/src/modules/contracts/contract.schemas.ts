import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

export const contractStatusApiSchema = z.enum([
  'rascunho',
  'pronto_envio',
  'aprovado',
  'enviado',
  'em_revisao',
  'assinado',
  'ativo',
  'encerrado',
  'cancelado',
]);

export const END_BEFORE_START_MESSAGE = 'A data de término não pode ser anterior à data de início';

export const createContractBodySchema = z
  .object({
    clientId: z.string().uuid('Cliente inválido'),
    templateId: z.string().uuid('Modelo inválido'),
    value: z.number().positive('Valor deve ser maior que zero'),
    object: z.string().trim().min(3, 'Descreva o objeto do contrato').max(2000),
    startDate: z.coerce.date({ message: 'Data de início inválida' }),
    endDate: z.coerce.date({ message: 'Data de término inválida' }).optional(),
    termText: z.string().trim().max(100).optional(),
    conditions: z.string().trim().max(4000).optional(),
  })
  .refine((data) => !data.endDate || data.endDate.getTime() >= data.startDate.getTime(), {
    message: END_BEFORE_START_MESSAGE,
    path: ['endDate'],
  });
export type CreateContractBody = z.infer<typeof createContractBodySchema>;

export const updateContractBodySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    value: z.number().positive().optional(),
    object: z.string().trim().min(3).max(2000).optional(),
    startDate: z.coerce.date().optional(),
    // null remove a data de término; ausente mantém o valor atual.
    endDate: z.coerce.date({ message: 'Data de término inválida' }).nullable().optional(),
    termText: z.string().trim().max(100).optional(),
    conditions: z.string().trim().max(4000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })
  // Quando início e término vêm juntos, valida já aqui; o caso em que só um deles
  // é enviado é validado no ContractService contra o valor persistido.
  .refine((data) => !data.startDate || !data.endDate || data.endDate.getTime() >= data.startDate.getTime(), {
    message: END_BEFORE_START_MESSAGE,
    path: ['endDate'],
  });
export type UpdateContractBody = z.infer<typeof updateContractBodySchema>;

export const updateContractStatusBodySchema = z.object({
  status: contractStatusApiSchema,
});
export type UpdateContractStatusBody = z.infer<typeof updateContractStatusBodySchema>;

/** Valor monetário de filtro (query string → número). Rejeita negativo/NaN/Infinity. */
const moneyFilter = (label: string) =>
  z.coerce.number({ message: `${label} inválido` }).nonnegative(`${label} inválido`).max(999_999_999_999, `${label} inválido`);

export const listContractsQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(200).optional(),
    status: contractStatusApiSchema.optional(),
    clientId: z.string().uuid().optional(),
    // Filtros avançados — todos opcionais e combináveis (AND) entre si e com search/status/clientId.
    startDateFrom: z.coerce.date({ message: 'Data inicial do período de início inválida' }).optional(),
    startDateTo: z.coerce.date({ message: 'Data final do período de início inválida' }).optional(),
    endDateFrom: z.coerce.date({ message: 'Data inicial do período de término inválida' }).optional(),
    endDateTo: z.coerce.date({ message: 'Data final do período de término inválida' }).optional(),
    valueMin: moneyFilter('Valor mínimo').optional(),
    valueMax: moneyFilter('Valor máximo').optional(),
  })
  .superRefine((query, ctx) => {
    if (query.valueMin !== undefined && query.valueMax !== undefined && query.valueMin > query.valueMax) {
      ctx.addIssue({ code: 'custom', path: ['valueMin'], message: 'O valor mínimo não pode ser maior que o valor máximo' });
    }
    if (query.startDateFrom && query.startDateTo && query.startDateFrom > query.startDateTo) {
      ctx.addIssue({ code: 'custom', path: ['startDateFrom'], message: 'O período de início é inválido (data inicial maior que a final)' });
    }
    if (query.endDateFrom && query.endDateTo && query.endDateFrom > query.endDateTo) {
      ctx.addIssue({ code: 'custom', path: ['endDateFrom'], message: 'O período de término é inválido (data inicial maior que a final)' });
    }
  });
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

export const contractIdParamsSchema = z.object({ id: z.string().uuid('ID de contrato inválido') });
export type ContractIdParams = z.infer<typeof contractIdParamsSchema>;

/** Body opcional: sem `versionNumber`, gera o PDF da versão atual. */
export const generateContractPdfBodySchema = z
  .object({ versionNumber: z.number().int().positive('Versão inválida').optional() })
  .optional();
export type GenerateContractPdfBody = z.infer<typeof generateContractPdfBodySchema>;

/** Renovação em um clique. `adjustmentPercent` opcional (ex.: 5.5 = +5,5%; negativo = redução). */
export const renewContractBodySchema = z.object({
  newEndDate: z.coerce.date({ message: 'Nova data de término inválida' }),
  adjustmentPercent: z
    .number({ message: 'Reajuste inválido' })
    .gt(-100, 'O reajuste deve ser maior que -100%')
    .max(1000, 'Reajuste muito alto')
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, { message: 'Use no máximo 2 casas decimais' })
    .optional(),
});
export type RenewContractBody = z.infer<typeof renewContractBodySchema>;

export const rejectContractBodySchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo da devolução').max(1000),
});
export type RejectContractBody = z.infer<typeof rejectContractBodySchema>;
