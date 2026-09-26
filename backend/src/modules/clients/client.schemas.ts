import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

const clientTypeSchema = z.enum(['PF', 'PJ'], {
  message: "Tipo deve ser 'PF' ou 'PJ'",
});

const clientStatusApiSchema = z.enum(['ativo', 'inativo']);

export const createClientBodySchema = z.object({
  type: clientTypeSchema,
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(200),
  document: z.string().trim().min(11, 'Documento inválido').max(20, 'Documento inválido'),
  email: z.string().trim().email('E-mail inválido'),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateClientBody = z.infer<typeof createClientBodySchema>;

export const updateClientBodySchema = createClientBodySchema
  .partial()
  .extend({ status: clientStatusApiSchema.optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });
export type UpdateClientBody = z.infer<typeof updateClientBodySchema>;

export const listClientsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: clientStatusApiSchema.optional(),
  type: clientTypeSchema.optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const clientIdParamsSchema = z.object({ id: z.string().uuid('ID de cliente inválido') });
export type ClientIdParams = z.infer<typeof clientIdParamsSchema>;
