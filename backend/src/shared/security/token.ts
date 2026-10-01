import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Primitivas criptográficas do aceite eletrônico e do segredo do cron.
 * Somente `node:crypto` (sem dependências externas, sem custo).
 */

/** Bytes de entropia do token público (256 bits). */
export const PUBLIC_TOKEN_BYTES = 32;

/** Token aleatório criptograficamente seguro, em base64url (43 caracteres). */
export function generatePublicToken(): string {
  return randomBytes(PUBLIC_TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hexadecimal (64 chars) de uma string UTF-8. Usado no token e no hash do aceite. */
export function sha256OfString(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Hash que é persistido no lugar do token bruto. */
export function hashPublicToken(token: string): string {
  return sha256OfString(token);
}

/**
 * Comparação de segredos em tempo constante. Os dois lados passam por SHA-256
 * antes do `timingSafeEqual`, o que (1) iguala os comprimentos — timingSafeEqual
 * lança erro se forem diferentes — e (2) não vaza o tamanho do segredo real.
 */
export function safeEqualSecret(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Substitui o token na URL do aceite público, para nunca aparecer em logs. */
export function redactSignatureTokenInUrl(url: string): string {
  return url.replace(/(\/public\/signatures\/)[^/?#]+/g, '$1[REDACTED]');
}
