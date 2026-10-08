import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  hotp,
  looksLikeBackupCode,
  parseEncryptionKey,
  resolveTwoFactorMasterKey,
  signLoginChallenge,
  totpAt,
  totpStep,
  verifyLoginChallenge,
  verifyTotp,
} from '../../src/shared/security/two-factor';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const KEY = Buffer.alloc(32, 7);
const JWT_SECRET = 'a-jwt-secret-for-tests-only-123456';

describe('TOTP (RFC 6238)', () => {
  it('base32 faz ida e volta', () => {
    const raw = Buffer.from('lexcontract-2fa');
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
    expect(() => base32Decode('1!?')).toThrow();
  });

  it('bate com os vetores de teste do RFC 4226/6238 (SHA-1)', () => {
    expect(hotp(RFC_SECRET, 0)).toBe('755224');
    expect(hotp(RFC_SECRET, 1)).toBe('287082'); // T=59s
    expect(hotp(RFC_SECRET, 37037036)).toBe('081804'); // T=1111111109s
  });

  it('aceita código válido, inclusive ±1 passo, e rejeita inválido', () => {
    const now = new Date('2026-10-07T12:00:10Z');
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now, null)).toEqual({ valid: true, step });
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now, null).valid).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now, null).valid).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 3), now, null).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, '000000', now, null).valid).toBe(totpAt(RFC_SECRET, step) === '000000');
    expect(verifyTotp(RFC_SECRET, '12345', now, null).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', now, null).valid).toBe(false);
  });

  it('rejeita reutilização do mesmo passo (replay)', () => {
    const now = new Date('2026-10-07T12:00:10Z');
    const step = totpStep(now);
    const code = totpAt(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, code, now, step - 1).valid).toBe(true);
  });

  it('gera segredos aleatórios de 160 bits e URI otpauth compatível com apps autenticadores', () => {
    const a = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(generateTotpSecret());
    const uri = buildOtpauthUri({ secretBase32: a, accountName: 'ana@x.com', issuer: 'LexContract' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/LexContract:ana%40x\.com\?/);
    expect(uri).toContain(`secret=${a}`);
    expect(uri).toContain('digits=6');
  });
});

describe('segredo em repouso', () => {
  it('criptografa (AES-256-GCM) sem texto puro e decifra de volta', () => {
    const encrypted = encryptSecret(RFC_SECRET, KEY);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain(RFC_SECRET);
    expect(decryptSecret(encrypted, KEY)).toBe(RFC_SECRET);
    expect(encryptSecret(RFC_SECRET, KEY)).not.toBe(encrypted); // IV aleatório
  });

  it('chave errada ou conteúdo adulterado falham', () => {
    const encrypted = encryptSecret(RFC_SECRET, KEY);
    expect(() => decryptSecret(encrypted, Buffer.alloc(32, 9))).toThrow();
    const parts = encrypted.split('.');
    parts[3] = Buffer.from('adulterado').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
  });

  it('chave mestra: hex/base64 de 32 bytes; produção NUNCA tem chave implícita', () => {
    expect(parseEncryptionKey('a'.repeat(64))?.length).toBe(32);
    expect(parseEncryptionKey(Buffer.alloc(32, 1).toString('base64'))?.length).toBe(32);
    expect(parseEncryptionKey('curta')).toBeNull();
    expect(resolveTwoFactorMasterKey({ encryptionKey: undefined, jwtSecret: JWT_SECRET, nodeEnv: 'production' })).toBeNull();
    expect(resolveTwoFactorMasterKey({ encryptionKey: undefined, jwtSecret: JWT_SECRET, nodeEnv: 'development' })?.length).toBe(32);
    expect(resolveTwoFactorMasterKey({ encryptionKey: 'a'.repeat(64), jwtSecret: JWT_SECRET, nodeEnv: 'production' })?.length).toBe(32);
  });
});

describe('códigos de recuperação', () => {
  it('10 códigos únicos no formato XXXXX-XXXXX, só com caracteres não ambíguos', () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it('o hash é HMAC (não reversível), normaliza maiúsculas/hífen e depende da chave', () => {
    const [code] = generateBackupCodes(1) as [string];
    expect(hashBackupCode(code, KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBackupCode(code, KEY)).toBe(hashBackupCode(code.toLowerCase().replace('-', ' '), KEY));
    expect(hashBackupCode(code, KEY)).not.toBe(hashBackupCode(code, Buffer.alloc(32, 9)));
    expect(hashBackupCode(code, KEY)).not.toContain(code.replace('-', ''));
  });

  it('distingue código de recuperação de código TOTP', () => {
    expect(looksLikeBackupCode('ABCDE-FGHJK')).toBe(true);
    expect(looksLikeBackupCode('123456')).toBe(false);
  });
});

describe('challenge de login', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  it('é válido por 5 minutos e carrega só usuário/escritório/finalidade', () => {
    const token = signLoginChallenge({ userId: 'u1', officeId: 'o1' }, JWT_SECRET, now);
    expect(verifyLoginChallenge(token, JWT_SECRET, new Date(now.getTime() + 60_000))).toMatchObject({ userId: 'u1', officeId: 'o1', purpose: '2fa-login' });
  });

  it('expira', () => {
    const token = signLoginChallenge({ userId: 'u1', officeId: 'o1' }, JWT_SECRET, now);
    expect(verifyLoginChallenge(token, JWT_SECRET, new Date(now.getTime() + 5 * 60_000 + 1000))).toBeNull();
  });

  it('assinatura adulterada ou segredo diferente são rejeitados', () => {
    const token = signLoginChallenge({ userId: 'u1', officeId: 'o1' }, JWT_SECRET, now);
    const [body] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ purpose: '2fa-login', userId: 'admin', officeId: 'o1', exp: 9999999999 })).toString('base64url');
    expect(verifyLoginChallenge(`${forgedBody}.${token.split('.')[1]}`, JWT_SECRET, now)).toBeNull();
    expect(verifyLoginChallenge(token, 'outro-segredo-qualquer-123456', now)).toBeNull();
    expect(verifyLoginChallenge(`${body}.`, JWT_SECRET, now)).toBeNull();
    expect(verifyLoginChallenge('lixo', JWT_SECRET, now)).toBeNull();
  });
});
