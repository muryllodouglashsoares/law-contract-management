import { describe, expect, it } from 'vitest';

import { computeSignatureHash, canonicalSignaturePayload } from '../../src/shared/security/signature-hash';
import {
  generatePublicToken,
  hashPublicToken,
  redactSignatureTokenInUrl,
  safeEqualSecret,
  sha256OfString,
} from '../../src/shared/security/token';
import { isValidCnpj, isValidCpf, maskDocument } from '../../src/shared/utils/br-document';

describe('token público', () => {
  it('gera 32 bytes aleatórios em base64url (43 chars) e nunca repete', () => {
    const tokens = new Set(Array.from({ length: 50 }, generatePublicToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('hash é SHA-256 hexadecimal (vetor conhecido)', () => {
    expect(hashPublicToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('safeEqualSecret compara em tempo constante e lida com tamanhos diferentes', () => {
    expect(safeEqualSecret('segredo', 'segredo')).toBe(true);
    expect(safeEqualSecret('segredo', 'segredO')).toBe(false);
    expect(safeEqualSecret('curto', 'um-segredo-bem-mais-longo')).toBe(false);
  });

  it('mascara o token em URLs de log', () => {
    expect(redactSignatureTokenInUrl('/public/signatures/ABC_def-123/sign')).toBe('/public/signatures/[REDACTED]/sign');
    expect(redactSignatureTokenInUrl('/contracts')).toBe('/contracts');
  });
});

describe('hash do aceite', () => {
  const base = {
    signatureId: 'sig-1',
    contractId: 'c-1',
    contractVersionId: 'v-1',
    versionNumber: 2,
    contentHash: sha256OfString('texto'),
    signerName: 'Ana Souza',
    signerDocument: '52998224725',
    signerIp: '203.0.113.7',
    signedAt: new Date('2026-10-01T12:00:00.000Z'),
    consentTextVersion: 'v1',
  };

  it('é o SHA-256 do payload canônico e muda se qualquer campo mudar', () => {
    const hash = computeSignatureHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(sha256OfString(canonicalSignaturePayload(base)));
    expect(computeSignatureHash({ ...base, signerIp: '203.0.113.8' })).not.toBe(hash);
    expect(computeSignatureHash({ ...base, versionNumber: 3 })).not.toBe(hash);
  });

  it('o payload não contém token', () => {
    expect(Object.keys(JSON.parse(canonicalSignaturePayload(base)))).not.toContain('token');
  });
});

describe('CPF/CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('mascara mantendo só os 2 últimos dígitos', () => {
    expect(maskDocument('52998224725')).toBe('*********25');
  });
});
