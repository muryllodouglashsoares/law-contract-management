import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

const twoFactorCode = z.string().trim().min(6, 'Informe o código').max(16, 'Código inválido');

export const twoFactorVerifySetupBodySchema = z.object({ code: twoFactorCode });
export type TwoFactorVerifySetupBody = z.infer<typeof twoFactorVerifySetupBodySchema>;

export const twoFactorDisableBodySchema = z.object({
  password: z.string().min(1, 'Informe a senha atual'),
  code: twoFactorCode,
});
export type TwoFactorDisableBody = z.infer<typeof twoFactorDisableBodySchema>;

export const twoFactorVerifyLoginBodySchema = z.object({
  challengeToken: z.string().min(10).max(1000),
  code: twoFactorCode,
});
export type TwoFactorVerifyLoginBody = z.infer<typeof twoFactorVerifyLoginBodySchema>;
