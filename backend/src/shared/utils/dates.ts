/**
 * Utilitários de data em DIAS-CALENDÁRIO UTC. Datas de vencimento/término são gravadas em 00:00 UTC
 * (data de calendário, sem hora), então toda comparação "hoje / ontem / daqui a N dias" é feita em UTC.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Soma `days` dias-calendário a uma data (UTC). */
export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Dias (inteiros, em dias-calendário UTC) entre `now` e `target`. 0 = hoje; negativo = no passado. */
export function daysUntil(target: Date, now: Date): number {
  return Math.round((startOfUtcDay(target).getTime() - startOfUtcDay(now).getTime()) / DAY_MS);
}

/** Intervalo [início, fim) do dia-calendário UTC de `date`. */
export function utcDayRange(date: Date): { gte: Date; lt: Date } {
  const start = startOfUtcDay(date);
  return { gte: start, lt: addUtcDays(start, 1) };
}

export function formatDateBR(date: Date): string {
  // Data de calendário gravada em 00:00 UTC: formatar em UTC evita "voltar um dia".
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Soma `months` meses mantendo o DIA da data-base sempre que possível. Quando o mês de destino
 * não possui aquele dia (ex.: 31/01 + 1 mês), usa o último dia do mês (28/02 ou 29/02). Sempre
 * calculado a partir da data-base (e não encadeado), então 31/01 → 28/02 → 31/03 (e não 28/03).
 */
export function addMonthsClamped(base: Date, months: number): Date {
  const total = base.getUTCFullYear() * 12 + base.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const day = Math.min(base.getUTCDate(), daysInUtcMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day));
}
