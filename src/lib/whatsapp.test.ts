import { buildSignatureWhatsAppMessage, buildWhatsAppUrl, normalizeBrazilianPhone } from './whatsapp';

const URL_SIGN = 'https://app.exemplo.com.br/assinar/AbC-123_token';

describe('normalizeBrazilianPhone', () => {
  it('celular formatado vira DDI + DDD + número', () => {
    expect(normalizeBrazilianPhone('(11) 99999-1111')).toBe('5511999991111');
    expect(normalizeBrazilianPhone('11999991111')).toBe('5511999991111');
    expect(normalizeBrazilianPhone('11 9 9999-1111')).toBe('5511999991111');
  });

  it('fixo (10 dígitos) também é aceito', () => {
    expect(normalizeBrazilianPhone('(11) 4002-8888')).toBe('551140028888');
  });

  it('não duplica o 55 quando já está presente', () => {
    expect(normalizeBrazilianPhone('+55 (11) 99999-1111')).toBe('5511999991111');
    expect(normalizeBrazilianPhone('5511999991111')).toBe('5511999991111');
    expect(normalizeBrazilianPhone('55 11 4002-8888')).toBe('551140028888');
  });

  it('DDD 55 (RS) com 11 dígitos não é confundido com o código do país', () => {
    expect(normalizeBrazilianPhone('(55) 99999-1111')).toBe('5555999991111');
    // Com o código do país já presente (13 dígitos), o 55 do DDD é preservado.
    expect(normalizeBrazilianPhone('5555999991111')).toBe('5555999991111');
  });

  it('retorna null para ausente, curto, longo, DDD inválido ou celular sem o 9', () => {
    for (const bad of [null, undefined, '', '   ', 'abc', '99999-1111', '999991111', '(11) 8888-77777', '(01) 99999-1111', '(11) 89999-1111', '00000000000', '1100000000', '551199999111122']) {
      expect(normalizeBrazilianPhone(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe('buildSignatureWhatsAppMessage', () => {
  const message = buildSignatureWhatsAppMessage({ contractNumber: 123, url: URL_SIGN });

  it('contém o número do contrato e o link, ambos dinâmicos', () => {
    expect(message).toContain('Contrato #123');
    expect(message).toContain(URL_SIGN);
    expect(buildSignatureWhatsAppMessage({ contractNumber: 7, url: 'https://x.test/assinar/t' })).toContain('Contrato #7');
  });

  it('é curta, profissional e informa uso único e validade limitada', () => {
    expect(message).toContain('assinatura eletrônica');
    expect(message).toContain('uso único');
    expect(message).toContain('validade limitada');
    expect(message.length).toBeLessThan(400);
  });

  it('não inclui dados sensíveis: só o número do contrato e o link aparecem como dados', () => {
    const stripped = message.replace('#123', '').replace(URL_SIGN, '');
    expect(stripped).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/); // CPF
    expect(stripped).not.toMatch(/R\$|\d/); // sem valores nem outros números
  });
});

describe('buildWhatsAppUrl', () => {
  const message = buildSignatureWhatsAppMessage({ contractNumber: 123, url: URL_SIGN });

  it('forma https://wa.me/<número>?text=<mensagem codificada>', () => {
    const url = buildWhatsAppUrl('(11) 99999-1111', message);
    expect(url).toBe(`https://wa.me/5511999991111?text=${encodeURIComponent(message)}`);
  });

  it('a mensagem é codificada: quebras de linha, espaços e o link sobrevivem ao decode', () => {
    const url = buildWhatsAppUrl('(11) 99999-1111', message) as string;
    expect(url).not.toContain(' ');
    expect(url).not.toContain('\n');
    const text = new URL(url).searchParams.get('text');
    expect(text).toBe(message);
    expect(text).toContain(URL_SIGN);
    expect(text).toContain('Contrato #123');
  });

  it('telefone ausente ou inválido NÃO gera URL (nada de wa.me/ vazio)', () => {
    expect(buildWhatsAppUrl(null, message)).toBeNull();
    expect(buildWhatsAppUrl('', message)).toBeNull();
    expect(buildWhatsAppUrl('123', message)).toBeNull();
  });
});
