// Testes do frontend (sem React): rodados pelo vitest do backend (ver backend/vitest.config.ts).
import { checkDocument, formatCpfOrCnpj, isValidCnpj, isValidCpf, isValidCpfOrCnpj, onlyDigits } from './br-document';

const CPF_OK = '52998224725';
const CPF_OK_2 = '11144477735';
const CNPJ_OK = '11222333000181';

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
    expect(onlyDigits(' 11.222.333/0001-81 ')).toBe('11222333000181');
    expect(onlyDigits('abc')).toBe('');
  });
});

describe('CPF', () => {
  it('aceita CPFs válidos, com ou sem pontuação', () => {
    expect(isValidCpf(CPF_OK)).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf(CPF_OK_2)).toBe(true);
  });

  it('rejeita dígito verificador errado, tamanho errado e sequências repetidas', () => {
    expect(isValidCpf('52998224726')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('aceita CNPJs válidos, com ou sem pontuação', () => {
    expect(isValidCnpj(CNPJ_OK)).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita dígito verificador errado, tamanho errado e sequências repetidas', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });

  it('um CPF não é CNPJ e vice-versa', () => {
    expect(isValidCnpj(CPF_OK)).toBe(false);
    expect(isValidCpf(CNPJ_OK)).toBe(false);
    expect(isValidCpfOrCnpj(CPF_OK)).toBe(true);
    expect(isValidCpfOrCnpj(CNPJ_OK)).toBe(true);
    expect(isValidCpfOrCnpj('12345678900')).toBe(false);
  });
});

describe('formatCpfOrCnpj (máscara dinâmica)', () => {
  it('aplica a máscara de CPF progressivamente', () => {
    expect(formatCpfOrCnpj('5')).toBe('5');
    expect(formatCpfOrCnpj('5299')).toBe('529.9');
    expect(formatCpfOrCnpj('529982')).toBe('529.982');
    expect(formatCpfOrCnpj('5299822')).toBe('529.982.2');
    expect(formatCpfOrCnpj('529982247')).toBe('529.982.247');
    expect(formatCpfOrCnpj('5299822472')).toBe('529.982.247-2');
    expect(formatCpfOrCnpj('52998224725')).toBe('529.982.247-25');
  });

  it('troca para a máscara de CNPJ ao passar de 11 dígitos', () => {
    expect(formatCpfOrCnpj('529982247250')).toBe('52.998.224/7250');
    expect(formatCpfOrCnpj('11222333')).toBe('112.223.33');
    expect(formatCpfOrCnpj('112223330001')).toBe('11.222.333/0001');
    expect(formatCpfOrCnpj('1122233300018')).toBe('11.222.333/0001-8');
    expect(formatCpfOrCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('aceita documento colado já formatado (CPF e CNPJ) e reformata igual', () => {
    expect(formatCpfOrCnpj('529.982.247-25')).toBe('529.982.247-25');
    expect(formatCpfOrCnpj('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });

  it('descarta letras/símbolos e limita a 14 dígitos', () => {
    expect(formatCpfOrCnpj('abc529x982')).toBe('529.982');
    expect(formatCpfOrCnpj('112223330001819999')).toBe('11.222.333/0001-81');
    expect(onlyDigits(formatCpfOrCnpj('1122233300018199')).length).toBe(14);
  });

  it('vazio continua vazio; apagar volta a máscara (idempotente)', () => {
    expect(formatCpfOrCnpj('')).toBe('');
    expect(formatCpfOrCnpj('529.982.247-')).toBe('529.982.247');
    expect(formatCpfOrCnpj(formatCpfOrCnpj('52998224725'))).toBe('529.982.247-25');
  });
});

describe('checkDocument (feedback visual)', () => {
  it('vazio: sem mensagem', () => {
    expect(checkDocument('')).toMatchObject({ status: 'empty', valid: false, message: null });
  });

  it('incompleto (menos de 11, ou 12–13 dígitos): pede um CPF ou CNPJ válido', () => {
    for (const value of ['5', '5299822472', '529982247250', '1122233300018']) {
      expect(checkDocument(value)).toMatchObject({ status: 'incomplete', valid: false, message: 'Informe um CPF ou CNPJ válido' });
    }
  });

  it('11 dígitos valida o CPF pelos dígitos verificadores, não só pelo tamanho', () => {
    expect(checkDocument('529.982.247-25')).toMatchObject({ status: 'valid', valid: true, message: null, digits: '52998224725' });
    expect(checkDocument('529.982.247-26')).toMatchObject({ status: 'invalid-cpf', valid: false, message: 'CPF inválido' });
    expect(checkDocument('11111111111')).toMatchObject({ status: 'invalid-cpf', message: 'CPF inválido' });
  });

  it('14 dígitos valida o CNPJ pelos dígitos verificadores', () => {
    expect(checkDocument('11.222.333/0001-81')).toMatchObject({ status: 'valid', valid: true, digits: '11222333000181' });
    expect(checkDocument('11.222.333/0001-82')).toMatchObject({ status: 'invalid-cnpj', valid: false, message: 'CNPJ inválido' });
  });

  it('devolve sempre só dígitos (nunca a pontuação) e no máximo 14', () => {
    expect(checkDocument('529.982.247-25').digits).toBe('52998224725');
    expect(checkDocument('1122233300018199999').digits).toHaveLength(14);
  });
});
