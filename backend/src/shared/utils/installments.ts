import { addMonthsClamped, startOfUtcDay } from './dates';

/**
 * Plano de parcelas — cálculo financeiro SEMPRE em centavos inteiros (nunca ponto flutuante).
 *
 * Distribuição do arredondamento (determinística): o total é dividido em `count` partes iguais
 * (piso, em centavos) e os centavos restantes são somados, 1 a 1, às PRIMEIRAS parcelas.
 * Ex.: R$ 100,00 em 3x → 33,34 / 33,33 / 33,33. A soma é sempre exatamente o total.
 */

export const MAX_INSTALLMENTS = 120;
/** Limite de Decimal(12,2): 9.999.999.999,99 (em centavos: 999.999.999.999). */
export const MAX_TOTAL_CENTS = 999_999_999_999;

export interface InstallmentPlanItem {
  installmentNumber: number;
  installmentTotal: number;
  /** Valor em centavos (inteiro). */
  cents: number;
  /** Valor em reais com 2 casas, como string decimal exata (ex.: "33.34") — segura para Prisma.Decimal. */
  value: string;
  dueDate: Date;
}

/** Converte reais (number com no máx. 2 casas) em centavos inteiros, rejeitando valores com mais precisão. */
export function toCents(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  // Tolerância só para o erro binário de ponto flutuante (ex.: 0.07 * 100 = 7.000000000000001).
  if (Math.abs(value * 100 - cents) > 1e-6) return null;
  if (cents <= 0 || cents > MAX_TOTAL_CENTS) return null;
  return cents;
}

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

export function splitCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function buildInstallmentPlan(input: {
  totalCents: number;
  count: number;
  firstDueDate: Date;
}): InstallmentPlanItem[] {
  const firstDue = startOfUtcDay(input.firstDueDate);
  return splitCents(input.totalCents, input.count).map((cents, index) => ({
    installmentNumber: index + 1,
    installmentTotal: input.count,
    cents,
    value: centsToDecimalString(cents),
    dueDate: addMonthsClamped(firstDue, index),
  }));
}
