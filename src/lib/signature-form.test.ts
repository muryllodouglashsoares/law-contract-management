import { formatCpfOrCnpj } from './br-document';
import { buildSignPayload, evaluateSignatureForm } from './signature-form';

const OK = { signerName: 'Maria Fernanda Costa', signerDocument: '529.982.247-25', consent: true };

describe('evaluateSignatureForm — botão "Assinar contrato"', () => {
  it('habilitado só com nome válido + CPF/CNPJ válido + consentimento', () => {
    expect(evaluateSignatureForm(OK).canSubmit).toBe(true);
    expect(evaluateSignatureForm({ ...OK, signerDocument: '11.222.333/0001-81' }).canSubmit).toBe(true);
  });

  it('bloqueado com nome inválido (curto ou só espaços)', () => {
    expect(evaluateSignatureForm({ ...OK, signerName: 'Al' }).canSubmit).toBe(false);
    expect(evaluateSignatureForm({ ...OK, signerName: '    ' }).canSubmit).toBe(false);
    expect(evaluateSignatureForm({ ...OK, signerName: '' }).canSubmit).toBe(false);
  });

  it('bloqueado com documento incompleto', () => {
    expect(evaluateSignatureForm({ ...OK, signerDocument: '' }).canSubmit).toBe(false);
    expect(evaluateSignatureForm({ ...OK, signerDocument: '529.982.247' }).canSubmit).toBe(false);
    expect(evaluateSignatureForm({ ...OK, signerDocument: '52.998.224/7250' }).canSubmit).toBe(false);
  });

  it('bloqueado com documento inválido (11 ou 14 dígitos com verificador errado)', () => {
    expect(evaluateSignatureForm({ ...OK, signerDocument: '529.982.247-26' }).canSubmit).toBe(false);
    expect(evaluateSignatureForm({ ...OK, signerDocument: '111.111.111-11' }).canSubmit).toBe(false);
    expect(evaluateSignatureForm({ ...OK, signerDocument: '11.222.333/0001-82' }).canSubmit).toBe(false);
  });

  it('bloqueado sem o consentimento', () => {
    expect(evaluateSignatureForm({ ...OK, consent: false }).canSubmit).toBe(false);
  });
});

describe('buildSignPayload — o que vai para o backend', () => {
  it('envia signerDocument SOMENTE com dígitos (máscara removida) e o nome sem espaços nas pontas', () => {
    expect(buildSignPayload({ ...OK, signerName: '  Maria Fernanda Costa  ' })).toEqual({
      signerName: 'Maria Fernanda Costa',
      signerDocument: '52998224725',
      consent: true,
    });
    expect(buildSignPayload({ ...OK, signerDocument: '11.222.333/0001-81' })?.signerDocument).toBe('11222333000181');
  });

  it('o fluxo digitar → máscara → envio resulta em dígitos puros', () => {
    // Simula o onChange do campo (máscara) e depois o submit.
    let field = '';
    for (const key of '52998224725') field = formatCpfOrCnpj(field + key);
    expect(field).toBe('529.982.247-25');
    expect(buildSignPayload({ ...OK, signerDocument: field })?.signerDocument).toBe('52998224725');
  });

  it('não gera payload quando o formulário não pode ser enviado', () => {
    expect(buildSignPayload({ ...OK, signerDocument: '529.982.247-26' })).toBeNull();
    expect(buildSignPayload({ ...OK, consent: false })).toBeNull();
    expect(buildSignPayload({ ...OK, signerName: 'Jo' })).toBeNull();
  });
});
