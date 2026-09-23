import { z } from 'zod';

/**
 * Atualização do próprio perfil (PATCH /users/me).
 * Nesta primeira etapa, apenas o nome é editável por aqui.
 * Alteração de e-mail e senha ficarão em fluxos dedicados (com
 * verificação/senha atual), a serem implementados junto do módulo
 * de administração de usuários do escritório.
 */
export const updateMeBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(120).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;
