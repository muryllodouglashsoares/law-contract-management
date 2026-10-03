/**
 * Mascara o token do aceite eletrônico em URLs/caminhos do frontend
 * (`/assinar/<token>`), preservando query string e hash.
 *
 * Função pura, usada pelo Sentry (beforeSend/beforeBreadcrumb) para que o token
 * nunca saia do navegador. Equivalente, no frontend, a `redactSignatureTokenInUrl`
 * do backend (`/public/signatures/<token>`).
 */
const SIGNATURE_PATH_PATTERN = /(\/assinar\/)[^/?#\s"'`)]+/g;

export const REDACTED_TOKEN = '[REDACTED]';

export function redactSignatureToken(value: string): string {
  return value.replace(SIGNATURE_PATH_PATTERN, `$1${REDACTED_TOKEN}`);
}
