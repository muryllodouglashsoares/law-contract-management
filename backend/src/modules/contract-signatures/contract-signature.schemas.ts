import { z } from 'zod';

import { isValidCpfOrCnpj, onlyDigits } from '../../shared/utils/br-document';

/** Token na URL. Validação de formato é propositalmente frouxa: qualquer valor que
 * não corresponda a um hash conhecido vira o mesmo 404 genérico (sem enumeração). */
export const publicTokenParamsSchema = z.object({
  token: z.string().min(1).max(200),
});
export type PublicTokenParams = z.infer<typeof publicTokenParamsSchema>;

export const signContractBodySchema = z.object({
  signerName: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo')
    .max(120, 'Nome muito longo')
    // Sem caracteres de controle (o nome vai para notificação/trilha de auditoria).
    .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), { message: 'Nome inválido' }),
  signerDocument: z
    .string()
    .trim()
    .max(32)
    .refine(isValidCpfOrCnpj, { message: 'CPF/CNPJ inválido' })
    .transform(onlyDigits),
  consent: z.literal(true, { message: 'É necessário confirmar o consentimento para assinar' }),
});
export type SignContractBody = z.infer<typeof signContractBodySchema>;
