import { describe, expect, it } from 'vitest';

import { addMonthsClamped, daysUntil, startOfUtcDay } from '../../src/shared/utils/dates';
import { buildInstallmentPlan, centsToDecimalString, splitCents, toCents } from '../../src/shared/utils/installments';
import { applyPercentAdjustment } from '../../src/shared/utils/money';
import { Prisma } from '@prisma/client';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('splitCents (arredondamento determinístico)', () => {
  it('R$ 100 em 3x → 33,34 / 33,33 / 33,33 (a diferença vai para as primeiras parcelas)', () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it('a soma é SEMPRE exatamente o total, para vários casos', () => {
    for (const [total, count] of [[10000, 3], [1, 3], [100, 7], [1200000, 12], [99999, 11], [5, 120], [999_999_999_999, 120]] as const) {
      const parts = splitCents(total, count);
      expect(parts).toHaveLength(count);
      expect(sum(parts)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
  });

  it('R$ 12.000 em 12x → 12 parcelas de R$ 1.000,00', () => {
    expect(splitCents(1_200_000, 12).every((c) => c === 100_000)).toBe(true);
  });
});

describe('toCents', () => {
  it('converte sem erro de ponto flutuante', () => {
    expect(toCents(0.07)).toBe(7);
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(19.99)).toBe(1999);
  });
  it('rejeita zero, negativo, mais de 2 casas, NaN e acima do limite do banco', () => {
    for (const bad of [0, -5, 10.005, NaN, Infinity, 10_000_000_000]) expect(toCents(bad)).toBeNull();
  });
  it('formata centavos como decimal exato', () => {
    expect(centsToDecimalString(3334)).toBe('33.34');
    expect(centsToDecimalString(5)).toBe('0.05');
  });
});

describe('vencimentos', () => {
  it('mantém o dia do primeiro vencimento mês a mês', () => {
    const plan = buildInstallmentPlan({ totalCents: 1_200_000, count: 12, firstDueDate: new Date('2026-11-10T00:00:00Z') });
    expect(plan[0]?.dueDate.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(plan[1]?.dueDate.toISOString()).toBe('2026-12-10T00:00:00.000Z');
    expect(plan[2]?.dueDate.toISOString()).toBe('2027-01-10T00:00:00.000Z');
    expect(plan[11]?.dueDate.toISOString()).toBe('2027-10-10T00:00:00.000Z');
    expect(plan.map((p) => `${p.installmentNumber}/${p.installmentTotal}`).slice(0, 2)).toEqual(['1/12', '2/12']);
  });

  it('31/01 não gera datas inválidas: usa o último dia do mês e volta ao 31 quando existe', () => {
    const base = new Date('2027-01-31T00:00:00Z');
    expect(addMonthsClamped(base, 1).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(addMonthsClamped(base, 2).toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(addMonthsClamped(base, 3).toISOString()).toBe('2027-04-30T00:00:00.000Z');
  });

  it('ano bissexto e virada de ano', () => {
    expect(addMonthsClamped(new Date('2027-12-31T00:00:00Z'), 2).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonthsClamped(new Date('2026-11-30T00:00:00Z'), 3).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(addMonthsClamped(new Date('2026-05-15T00:00:00Z'), -6).toISOString()).toBe('2025-11-15T00:00:00.000Z');
  });

  it('ignora a hora da data informada (data de calendário UTC)', () => {
    const plan = buildInstallmentPlan({ totalCents: 100, count: 1, firstDueDate: new Date('2026-11-10T18:45:00Z') });
    expect(plan[0]?.dueDate.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });
});

describe('datas utilitárias', () => {
  it('daysUntil em dias-calendário UTC', () => {
    const now = new Date('2026-10-07T23:30:00Z');
    expect(daysUntil(new Date('2026-10-07T00:00:00Z'), now)).toBe(0);
    expect(daysUntil(new Date('2026-10-10T00:00:00Z'), now)).toBe(3);
    expect(daysUntil(new Date('2026-10-06T00:00:00Z'), now)).toBe(-1);
    expect(startOfUtcDay(now).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });
});

describe('reajuste percentual em Decimal', () => {
  it('aplica e arredonda a 2 casas (meio para cima)', () => {
    expect(applyPercentAdjustment(new Prisma.Decimal('1000.00'), 5).toString()).toBe('1050');
    expect(applyPercentAdjustment(new Prisma.Decimal('1234.56'), 4.5).toFixed(2)).toBe('1290.12');
    expect(applyPercentAdjustment(new Prisma.Decimal('100.00'), 0.5).toFixed(2)).toBe('100.50');
    expect(applyPercentAdjustment(new Prisma.Decimal('0.10'), 5).toFixed(2)).toBe('0.11'); // 0.105 → 0.11
  });
  it('reajuste negativo e zero', () => {
    expect(applyPercentAdjustment(new Prisma.Decimal('200.00'), -10).toFixed(2)).toBe('180.00');
    expect(applyPercentAdjustment(new Prisma.Decimal('200.00'), 0).toFixed(2)).toBe('200.00');
  });
});
