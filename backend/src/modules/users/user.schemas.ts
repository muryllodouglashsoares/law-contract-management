import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/http/pagination';

const nameSchema = z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(120);
const phoneSchema = z.string().trim().max(30);
// Mesma regra de OAB já usada em PATCH /users/me: texto livre de até 40 caracteres.
const oabNumberSchema = z.string().trim().max(40);
const userRoleSchema = z.enum(['ADMIN', 'LAWYER', 'ASSISTANT'], {
  message: "Papel deve ser 'ADMIN', 'LAWYER' ou 'ASSISTANT'",
});
const userStatusSchema = z.enum(['ACTIVE', 'INACTIVE'], {
  message: "Status deve ser 'ACTIVE' ou 'INACTIVE'",
});

/**
 * Atualização do próprio perfil (PATCH /users/me): nome, telefone e OAB.
 * Alteração de e-mail fica fora de escopo por ora (normalmente exigiria um
 * fluxo de verificação). Troca de senha tem endpoint dedicado abaixo,
 * exigindo a senha atual (ver changePasswordBodySchema).
 */
export const updateMeBodySchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    oabNumber: oabNumberSchema.optional(),
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

// ---------------------------------------------------------------------
// Gestão de usuários pelo ADMIN. Campos controlados pelo backend (officeId,
// senha, status, mustChangePassword) NÃO fazem parte do body: `.strict()`
// rejeita qualquer tentativa de enviá-los.
// ---------------------------------------------------------------------

/** Campo opcional de texto: string vazia (formulário em branco) conta como ausente. */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const createUserBodySchema = z
  .object({
    name: nameSchema,
    email: z.string().trim().email('E-mail inválido').max(254),
    role: userRoleSchema,
    phone: emptyToUndefined(phoneSchema),
    oabNumber: emptyToUndefined(oabNumberSchema),
  })
  .strict();
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const userIdParamsSchema = z.object({ id: z.string().uuid('ID de usuário inválido') });
export type UserIdParams = z.infer<typeof userIdParamsSchema>;

export const updateUserRoleBodySchema = z.object({ role: userRoleSchema }).strict();
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleBodySchema>;

export const updateUserStatusBodySchema = z.object({ status: userStatusSchema }).strict();
export type UpdateUserStatusBody = z.infer<typeof updateUserStatusBodySchema>;

export const updateNotificationPreferencesBodySchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos uma preferência para atualizar' });
export type UpdateNotificationPreferencesBody = z.infer<typeof updateNotificationPreferencesBodySchema>;
