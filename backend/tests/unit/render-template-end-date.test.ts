import { describe, expect, it } from 'vitest';

import { buildContractTemplateVariables, renderTemplate } from '../../src/shared/domain/render-template';

const input = {
  client: { name: 'Ana', document: '1', email: 'a@a.com', phone: null, address: null },
  contract: { object: 'x', value: 10, startDate: new Date('2026-01-10T00:00:00Z'), termText: null, number: 1 },
  lawyer: { name: 'L', email: 'l@l.com', oabNumber: null },
  office: { name: 'E' },
};

describe('{{contrato.data_fim}}', () => {
  it('renderiza a data de término quando existe', () => {
    const vars = buildContractTemplateVariables({ ...input, contract: { ...input.contract, endDate: new Date('2026-12-31T12:00:00Z') } });
    expect(renderTemplate('Fim: {{contrato.data_fim}}', vars)).toBe('Fim: 31/12/2026');
  });

  it('fica vazio sem endDate e templates antigos continuam iguais', () => {
    const vars = buildContractTemplateVariables(input);
    expect(vars['contrato.data_fim']).toBe('');
    expect(renderTemplate('Início {{contrato.data_inicio}}', vars)).toBe(`Início ${new Date('2026-01-10T00:00:00Z').toLocaleDateString('pt-BR')}`);
  });
});
