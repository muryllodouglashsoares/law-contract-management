/**
 * Validação e máscara de CPF/CNPJ no frontend (UX). Espelha a lógica de
 * backend/src/shared/utils/br-document.ts, SEM importar código do backend. O backend continua
 * sendo a autoridade final: ele revalida o documento em toda assinatura.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function allSame(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || allSame(cpf)) return false;

  const check = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

export function isValidCnpj(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14 || allSame(cnpj)) return false;

  const check = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cnpj[i]) * (weights[i] ?? 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

export function isValidCpfOrCnpj(input: string): boolean {
  return isValidCpf(input) || isValidCnpj(input);
}

/** Máximo de dígitos de um documento (CNPJ). */
export const DOCUMENT_MAX_DIGITS = 14;

/**
 * Máscara dinâmica enquanto o usuário digita/cola: até 11 dígitos → CPF (000.000.000-00);
 * de 12 a 14 → CNPJ (00.000.000/0000-00). Qualquer caractere não numérico é descartado e o
 * texto é limitado a 14 dígitos.
 */
export function formatCpfOrCnpj(input: string): string {
  const d = onlyDigits(input).slice(0, DOCUMENT_MAX_DIGITS);

  if (d.length <= 11) {
    // CPF: 000.000.000-00
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  // CNPJ: 00.000.000/0000-00
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

export type DocumentStatus =
  | 'empty' // nada digitado
  | 'incomplete' // ainda faltam dígitos (menos de 11, ou 12–13)
  | 'invalid-cpf' // 11 dígitos, dígitos verificadores errados
  | 'invalid-cnpj' // 14 dígitos, dígitos verificadores errados
  | 'valid';

export interface DocumentCheck {
  status: DocumentStatus;
  /** Somente dígitos — é isto (e nunca a máscara) que vai para o backend. */
  digits: string;
  /** true apenas para CPF/CNPJ com dígitos verificadores corretos. */
  valid: boolean;
  /** Mensagem amigável; null quando vazio ou válido. */
  message: string | null;
}

export const DOCUMENT_MESSAGES = {
  cpfInvalid: 'CPF inválido',
  cnpjInvalid: 'CNPJ inválido',
  generic: 'Informe um CPF ou CNPJ válido',
} as const;

/**
 * Estado de validação para o feedback visual. 11 dígitos → valida CPF; 14 → valida CNPJ
 * (dígitos verificadores, não só o tamanho). 12–13 dígitos ainda é "incompleto": o usuário
 * está a caminho de um CNPJ.
 */
export function checkDocument(input: string): DocumentCheck {
  const digits = onlyDigits(input).slice(0, DOCUMENT_MAX_DIGITS);

  if (digits.length === 0) return { status: 'empty', digits, valid: false, message: null };

  if (digits.length === 11) {
    return isValidCpf(digits)
      ? { status: 'valid', digits, valid: true, message: null }
      : { status: 'invalid-cpf', digits, valid: false, message: DOCUMENT_MESSAGES.cpfInvalid };
  }

  if (digits.length === 14) {
    return isValidCnpj(digits)
      ? { status: 'valid', digits, valid: true, message: null }
      : { status: 'invalid-cnpj', digits, valid: false, message: DOCUMENT_MESSAGES.cnpjInvalid };
  }

  return { status: 'incomplete', digits, valid: false, message: DOCUMENT_MESSAGES.generic };
}
