import type { Prisma } from '@prisma/client';

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
