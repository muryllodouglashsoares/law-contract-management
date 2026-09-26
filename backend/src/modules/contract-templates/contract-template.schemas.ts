import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

const templateStatusApiSchema = z.enum(['ativo', 'rascunho']);

export const createContractTemplateBodySchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(200),
  description: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1, 'O conteúdo do modelo não pode ficar vazio'),
  status: templateStatusApiSchema.optional(),
});
export type CreateContractTemplateBody = z.infer<typeof createContractTemplateBodySchema>;

export const updateContractTemplateBodySchema = createContractTemplateBodySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });
export type UpdateContractTemplateBody = z.infer<typeof updateContractTemplateBodySchema>;

export const listContractTemplatesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: templateStatusApiSchema.optional(),
});
export type ListContractTemplatesQuery = z.infer<typeof listContractTemplatesQuerySchema>;

export const contractTemplateIdParamsSchema = z.object({ id: z.string().uuid('ID de modelo inválido') });
export type ContractTemplateIdParams = z.infer<typeof contractTemplateIdParamsSchema>;
