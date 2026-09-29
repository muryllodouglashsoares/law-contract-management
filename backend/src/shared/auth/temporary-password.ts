import { randomInt } from 'node:crypto';

// Sem caracteres ambíguos (0/O, 1/l/I) — a senha é lida/copiada por uma pessoa.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?-_';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const PASSWORD_LENGTH = 16;

const pick = (charset: string): string => charset[randomInt(charset.length)] as string;

/**
 * Gera uma senha provisória forte com CSPRNG (`crypto.randomInt`, sem viés de módulo):
 * 16 caracteres, com ao menos uma maiúscula, minúscula, dígito e símbolo,
 * embaralhados por Fisher-Yates também com CSPRNG.
 */
export function generateTemporaryPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }

  return chars.join('');
}
