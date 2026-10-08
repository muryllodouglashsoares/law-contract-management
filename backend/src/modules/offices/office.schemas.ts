import { z } from 'zod';

/** Edição dos dados do escritório (aba "Escritório" em Configurações). */
export const updateOfficeBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(200).optional(),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    specialties: z.string().trim().max(300).optional(),
    requireInternalApproval: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

export type UpdateOfficeBody = z.infer<typeof updateOfficeBodySchema>;
