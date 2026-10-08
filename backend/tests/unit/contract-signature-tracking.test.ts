import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ContractSignatureService } from '../../src/modules/contract-signatures/contract-signature.service';
import { hashPublicToken } from '../../src/shared/security/token';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const BODY = { signerName: 'João da Silva', signerDocument: '52998224725', accepted: true } as never;
const CTX = { ip: '203.0.113.9', userAgent: 'vitest' };

function makeService(config: Record<string, unknown> = {}) {
  const sig = {
    id: 'sig-1', officeId: 'office-1', contractId: 'c-1', contractVersionId: 'v-1', usedAt: null, revokedAt: null,
    expiresAt: new Date('2026-10-03T12:00:00.000Z'),
    contractVersion: { id: 'v-1', versionNumber: 1, content: 'texto', createdAt: NOW },
    contract: {
      id: 'c-1', number: 102, status: 'ENVIADO', responsibleId: 'lawyer-1', value: new Prisma.Decimal(10), object: 'o', startDate: NOW, endDate: null,
      client: { name: 'João da Silva' }, office: { name: 'Escritório' }, versions: [{ id: 'v-1' }],
    },
  };
  const calls: { where: unknown; data: unknown }[] = [];
  const tx = {
    contractPublicSignature: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    contract: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    notification: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    contractPublicSignature: {
      findUnique: vi.fn().mockResolvedValue(sig),
      updateMany: vi.fn(async (args: any) => { calls.push(args); return { count: 1 }; }),
      update: vi.fn(async (args: any) => { calls.push(args); return {}; }),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  const service = new ContractSignatureService(prisma, { publicAppUrl: 'https://app.test', expirationHours: 72, ...config }, () => NOW);
  return { service, prisma, calls, sig };
}

describe('rastreamento de abertura do link público', () => {
  it('registra firstOpenedAt (condicional), lastOpenedAt e incrementa openCount; busca pelo HASH do token', async () => {
    const { service, prisma, calls } = makeService();
    await service.getPublicView('token-bruto');

    expect(prisma.contractPublicSignature.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashPublicToken('token-bruto') });
    expect(calls[0]).toMatchObject({ where: { id: 'sig-1', firstOpenedAt: null }, data: { firstOpenedAt: NOW } });
    expect(calls[1]).toMatchObject({ where: { id: 'sig-1' }, data: { lastOpenedAt: NOW, openCount: { increment: 1 } } });
    // o token bruto nunca é gravado
    expect(JSON.stringify(calls)).not.toContain('token-bruto');
  });

  it('falha no rastreamento NÃO impede a leitura do contrato', async () => {
    const { service, prisma } = makeService();
    prisma.contractPublicSignature.updateMany.mockRejectedValue(new Error('db'));
    await expect(service.getPublicView('t')).resolves.toMatchObject({ contract: { number: 102 } });
  });

  it('link inválido/expirado não conta como abertura', async () => {
    const { service, prisma, sig } = makeService();
    sig.expiresAt = new Date('2026-09-01T00:00:00Z');
    await expect(service.getPublicView('t')).rejects.toMatchObject({ statusCode: 410 });
    expect(prisma.contractPublicSignature.updateMany).not.toHaveBeenCalled();
  });
});

describe('aceite → PDF final', () => {
  it('gera o PDF assinado depois do commit do aceite', async () => {
    const generateAfterSignature = vi.fn().mockResolvedValue(undefined);
    const { service, prisma } = makeService({ signedPdf: { generateAfterSignature } });
    const result = await service.sign('t', BODY, CTX);
    expect(result.signed).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(generateAfterSignature).toHaveBeenCalledWith('sig-1');
  });

  it('falha ao gerar o PDF não desfaz nem falha a assinatura', async () => {
    const generateAfterSignature = vi.fn().mockRejectedValue(new Error('S3 fora do ar'));
    const { service } = makeService({ signedPdf: { generateAfterSignature } });
    await expect(service.sign('t', BODY, CTX)).resolves.toMatchObject({ signed: true, contractNumber: 102 });
  });
});
