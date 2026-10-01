import { describe, expect, it } from 'vitest';

import {
  createContractBodySchema,
  listContractsQuerySchema,
  updateContractBodySchema,
} from '../../src/modules/contracts/contract.schemas';

const uuid = '3f2b8a40-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const base = { clientId: uuid, templateId: uuid, value: 1000, object: 'Objeto do contrato', startDate: '2026-01-10' };

describe('endDate (create/update)', () => {
  it('é opcional e aceita data válida', () => {
    expect(createContractBodySchema.safeParse(base).success).toBe(true);
    expect(createContractBodySchema.safeParse({ ...base, endDate: '2026-12-31' }).success).toBe(true);
  });

  it('rejeita data inválida e término anterior ao início', () => {
    expect(createContractBodySchema.safeParse({ ...base, endDate: 'não-é-data' }).success).toBe(false);
    const result = createContractBodySchema.safeParse({ ...base, endDate: '2026-01-09' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endDate']);
  });

  it('aceita término igual ao início', () => {
    expect(createContractBodySchema.safeParse({ ...base, endDate: '2026-01-10' }).success).toBe(true);
  });

  it('update: aceita null (remove), valida o par quando enviado junto', () => {
    expect(updateContractBodySchema.safeParse({ endDate: null }).success).toBe(true);
    expect(updateContractBodySchema.safeParse({ startDate: '2026-05-01', endDate: '2026-04-01' }).success).toBe(false);
  });
});

describe('filtros avançados (query)', () => {
  it('converte strings em números/datas e combina filtros', () => {
    const result = listContractsQuerySchema.parse({
      status: 'ativo',
      endDateFrom: '2026-10-01',
      endDateTo: '2026-10-31',
      valueMin: '5000',
      valueMax: '20000',
    });
    expect(result.valueMin).toBe(5000);
    expect(result.valueMax).toBe(20000);
    expect(result.endDateFrom).toBeInstanceOf(Date);
    expect(result.page).toBe(1);
  });

  it('rejeita valueMin > valueMax', () => {
    const result = listContractsQuerySchema.safeParse({ valueMin: '100', valueMax: '10' });
    expect(result.success).toBe(false);
  });

  it('rejeita datas inválidas, períodos invertidos e valores negativos/não numéricos', () => {
    expect(listContractsQuerySchema.safeParse({ startDateFrom: 'abc' }).success).toBe(false);
    expect(listContractsQuerySchema.safeParse({ endDateFrom: '2026-12-01', endDateTo: '2026-01-01' }).success).toBe(false);
    expect(listContractsQuerySchema.safeParse({ startDateFrom: '2026-12-01', startDateTo: '2026-01-01' }).success).toBe(false);
    expect(listContractsQuerySchema.safeParse({ valueMin: '-1' }).success).toBe(false);
    expect(listContractsQuerySchema.safeParse({ valueMax: 'abc' }).success).toBe(false);
  });
});
