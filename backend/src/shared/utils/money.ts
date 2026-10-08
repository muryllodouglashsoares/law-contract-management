import { Prisma } from '@prisma/client';

/**
 * Converte um campo Decimal do Prisma (usado para valores monetários, nunca
 * float) para number simples na resposta JSON da API. A precisão decimal
 * real é preservada no banco (@db.Decimal) e na lógica de negócio; a
 * conversão para number só acontece na borda de serialização, onde o
 * frontend espera `c.value.toLocaleString('pt-BR', ...)`.
 */
export function toMoneyNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

/**
 * Aplica um reajuste percentual a um valor monetário, sempre em Decimal (nunca float):
 *   novo = valor * (1 + percentual / 100), arredondado a 2 casas (meio para cima).
 */
export function applyPercentAdjustment(value: Prisma.Decimal, percent: number): Prisma.Decimal {
  const factor = new Prisma.Decimal(1).plus(new Prisma.Decimal(String(percent)).div(100));
  return value.mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
