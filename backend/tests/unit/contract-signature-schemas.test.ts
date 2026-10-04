import { describe, expect, it } from 'vitest';

import { signContractBodySchema } from '../../src/modules/contract-signatures/contract-signature.schemas';

/**
 * O backend é a autoridade final do CPF/CNPJ: a validação do frontend é só UX e pode ser
 * ignorada por quem chama a API diretamente.
 */
const base = { signerName: 'Maria da Silva', consent: true as const };
const parse = (signerDocument: string) => signContractBodySchema.safeParse({ ...base, signerDocument });

describe('signContractBodySchema — signerDocument', () => {
  it('aceita CPF/CNPJ válidos (com ou sem máscara) e normaliza para só dígitos', () => {
    for (const [input, digits] of [
      ['529.982.247-25', '52998224725'],
      ['52998224725', '52998224725'],
      ['11.222.333/0001-81', '11222333000181'],
      ['11222333000181', '11222333000181'],
    ] as const) {
      const result = parse(input);
      expect(result.success, input).toBe(true);
      if (result.success) expect(result.data.signerDocument).toBe(digits);
    }
  });

  it('rejeita CPF com dígito verificador errado, sequência repetida e documento incompleto', () => {
    for (const bad of ['529.982.247-26', '111.111.111-11', '529.982.247', '5299822472', '12345678900']) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });

  it('rejeita CNPJ com dígito verificador errado, sequência repetida e tamanho 12–13', () => {
    for (const bad of ['11.222.333/0001-82', '11.111.111/1111-11', '112223330001', '1122233300018']) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });

  it('rejeita vazio, letras e texto com dígitos válidos embutidos além do limite', () => {
    for (const bad of ['', 'abc', 'x'.repeat(40), `${'5'.repeat(40)}`]) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });

  it('o consentimento continua obrigatório', () => {
    expect(signContractBodySchema.safeParse({ ...base, signerDocument: '52998224725', consent: false }).success).toBe(false);
  });
});
