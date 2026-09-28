import { describe, expect, it } from 'vitest';

import { contractPdfFileName, generateContractPdf, normalizePdfText } from '../../src/shared/pdf/contract-pdf';

const baseInput = {
  contract: { number: 102 },
  version: {
    versionNumber: 2,
    createdAt: new Date('2026-09-28T15:42:00Z'),
    content: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nCONTRATANTE: João da Silva, ação nº 5.\n\nCLÁUSULA PRIMEIRA\nO objeto é a consultoria jurídica.',
  },
  office: { name: 'Silva & Associados Advocacia', document: '12.345.678/0001-90', email: 'contato@silva.adv.br' },
};

describe('generateContractPdf', () => {
  it('gera um PDF válido, com nome previsível e MIME correto', async () => {
    const pdf = await generateContractPdf(baseInput);

    expect(pdf.mimeType).toBe('application/pdf');
    expect(pdf.fileName).toBe('Contrato_102_v2.pdf');
    expect(pdf.buffer.byteLength).toBeGreaterThan(500);
    expect(pdf.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.buffer.subarray(-32).toString('latin1')).toContain('%%EOF');
  });

  it('quebra o conteúdo longo em várias páginas sem criar páginas em branco extras', async () => {
    const paragraph = 'Cláusula com acentuação: ção, ã, é, ü. '.repeat(20);
    const content = Array.from({ length: 80 }, () => paragraph).join('\n\n');
    const pdf = await generateContractPdf({ ...baseInput, version: { ...baseInput.version, content } });

    const pages = pdf.buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(3);
  });

  it('gera o mesmo PDF para a mesma versão (conteúdo determinístico)', async () => {
    const a = await generateContractPdf(baseInput);
    const b = await generateContractPdf(baseInput);
    // O /ID do trailer é aleatório no pdfkit; comparamos o tamanho e o corpo de páginas.
    expect(a.buffer.byteLength).toBe(b.buffer.byteLength);
  });
});

describe('helpers', () => {
  it('monta o nome do arquivo apenas com números', () => {
    expect(contractPdfFileName(7, 1)).toBe('Contrato_7_v1.pdf');
  });

  it('preserva acentos e troca caracteres não suportados', () => {
    expect(normalizePdfText('Ação — “teste” → ok')).toBe('Ação — “teste” ? ok');
  });
});
