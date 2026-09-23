import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
