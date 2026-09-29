import { describe, expect, it } from 'vitest';

import { assertSafeKey, buildStorageKey, keyBelongsToOffice, safeExtension } from '../../src/shared/storage/storage-key';

const OFFICE = '550e8400-e29b-41d4-a716-446655440000';

describe('storage-key', () => {
  it('gera {officeId}/{uuid}.{ext} e nunca usa o nome original', () => {
    const key = buildStorageKey(OFFICE, 'Contrato Final (1).PDF');
    expect(key).toMatch(new RegExp(`^${OFFICE}/[0-9a-f-]{36}\\.pdf$`));
    expect(key).not.toContain('Contrato');
  });

  it('gera chaves diferentes a cada chamada', () => {
    expect(buildStorageKey(OFFICE, 'a.pdf')).not.toBe(buildStorageKey(OFFICE, 'a.pdf'));
  });

  it('neutraliza path traversal no nome enviado', () => {
    const key = buildStorageKey(OFFICE, '../../etc/passwd.pdf');
    expect(key).toMatch(new RegExp(`^${OFFICE}/[0-9a-f-]{36}\\.pdf$`));
    expect(() => assertSafeKey(key)).not.toThrow();
    expect(buildStorageKey(OFFICE, '..\\..\\boot.ini')).toMatch(new RegExp(`^${OFFICE}/[0-9a-f-]{36}\\.ini$`));
  });

  it('descarta extensões suspeitas ou longas demais', () => {
    expect(safeExtension('arquivo.p/df')).toBe('');
    expect(safeExtension('arquivo.abcdefghijklmnop')).toBe('');
    expect(safeExtension('arquivo')).toBe('');
    expect(safeExtension('a.JPG')).toBe('.jpg');
  });

  it('rejeita officeId com caracteres perigosos', () => {
    expect(() => buildStorageKey('../outro', 'a.pdf')).toThrow();
    expect(() => buildStorageKey('a/b', 'a.pdf')).toThrow();
    expect(() => buildStorageKey('', 'a.pdf')).toThrow();
  });

  it.each(['../x/y.pdf', `${OFFICE}/../../x.pdf`, `/${OFFICE}/a.pdf`, `${OFFICE}/a/b.pdf`, `${OFFICE}\\a.pdf`, `${OFFICE}/a\0.pdf`, ''])(
    'assertSafeKey rejeita %j',
    (key) => {
      expect(() => assertSafeKey(key)).toThrow();
    },
  );

  it('keyBelongsToOffice compara o prefixo exato do escritório', () => {
    expect(keyBelongsToOffice(`${OFFICE}/a.pdf`, OFFICE)).toBe(true);
    expect(keyBelongsToOffice(`${OFFICE}x/a.pdf`, OFFICE)).toBe(false);
    expect(keyBelongsToOffice('outro/a.pdf', OFFICE)).toBe(false);
  });
});
