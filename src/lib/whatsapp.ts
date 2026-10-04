/**
 * "Enviar por WhatsApp": só monta um link https://wa.me/<número>?text=<mensagem>. Nada é
 * enviado pelo sistema — o usuário confirma o envio dentro do WhatsApp. Sem backend.
 */

const BRAZIL_CODE = '55';

/**
 * Normaliza um telefone brasileiro para o formato internacional só com dígitos
 * ("(11) 99999-1111" → "5511999991111"). Aceita DDD + 8 ou 9 dígitos, com ou sem o 55 (que
 * nunca é duplicado). Retorna null quando não há um número plausível — nunca inventa número.
 */
export function normalizeBrazilianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');

  // Só remove o 55 quando sobra um número nacional completo (10–11 dígitos): "55 99999-1111"
  // (DDD 55, 11 dígitos) não tem código de país e é mantido como está.
  if (digits.startsWith(BRAZIL_CODE) && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(BRAZIL_CODE.length);
  }

  if (digits.length !== 10 && digits.length !== 11) return null;

  // DDD: dois dígitos, nenhum deles 0.
  if (!/^[1-9][1-9]/.test(digits)) return null;
  // Celular (11 dígitos) começa com 9 depois do DDD.
  if (digits.length === 11 && digits[2] !== '9') return null;
  // Sequências repetidas (ex.: 00000000) não são números reais.
  if (/^(\d)\1+$/.test(digits.slice(2))) return null;

  return `${BRAZIL_CODE}${digits}`;
}

/**
 * Mensagem curta e profissional. Só número do contrato e link — sem CPF, valores, conteúdo do
 * contrato nem dados internos.
 */
export function buildSignatureWhatsAppMessage(input: { contractNumber: number; url: string }): string {
  return [
    'Olá! O escritório disponibilizou o contrato para assinatura eletrônica.',
    '',
    `Contrato #${input.contractNumber}`,
    '',
    'Acesse o link para realizar o aceite:',
    input.url,
    '',
    'O link é de uso único e possui validade limitada.',
  ].join('\n');
}

/** URL oficial do WhatsApp com mensagem pré-preenchida; null se o telefone não for válido. */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeBrazilianPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
