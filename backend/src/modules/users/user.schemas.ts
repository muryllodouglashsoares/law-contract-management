import { z } from 'zod';

/**
 * Atualização do próprio perfil (PATCH /users/me): nome, telefone e OAB.
 * Alteração de e-mail fica fora de escopo por ora (normalmente exigiria um
 * fluxo de verificação). Troca de senha tem endpoint dedicado abaixo,
 * exigindo a senha atual (ver changePasswordBodySchema).
 */
export const updateMeBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    oabNumber: z.string().trim().max(40).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres'),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  });

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
