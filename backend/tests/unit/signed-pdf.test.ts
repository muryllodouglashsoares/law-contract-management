import { describe, expect, it, vi } from 'vitest';

import { SignedPdfService } from '../../src/modules/contract-signatures/signed-pdf.service';
import { generateContractPdf, signedContractPdfFileName } from '../../src/shared/pdf/contract-pdf';
import { computeSignatureHash } from '../../src/shared/security/signature-hash';
import { sha256OfString } from '../../src/shared/security/token';
import { sha256Hex } from '../../src/shared/utils/hash';
import { countPdfPages, extractPdfText } from './helpers-pdf';

const SIGNED_AT = new Date('2026-10-05T14:03:09Z');
const CONTENT = 'CONTRATO DE SERVIÇOS\n\nO objeto é a consultoria jurídica.';
const base = {
  contract: { number: 102 },
  version: { versionNumber: 2, createdAt: new Date('2026-09-28T15:42:00Z'), content: CONTENT },
  office: { name: 'Silva & Associados' },
  compress: false,
};
const SIGNATURE_HASH = computeSignatureHash({
  signatureId: 'sig-1', contractId: 'c-1', contractVersionId: 'v-2', versionNumber: 2, contentHash: sha256OfString(CONTENT),
  signerName: 'João da Silva', signerDocument: '52998224725', signerIp: '203.0.113.7', signedAt: SIGNED_AT, consentTextVersion: 'v1-2026-10',
});
const acceptance = {
  signerName: 'João da Silva', signerDocumentMasked: '*********25', signedAt: SIGNED_AT, signerIp: '203.0.113.7',
  signatureHash: SIGNATURE_HASH, consentTextVersion: 'v1-2026-10', contentHash: sha256OfString(CONTENT),
};

describe('PDF final com comprovante de aceite', () => {
  it('acrescenta UMA página ao PDF original e usa nome distinto', async () => {
    const original = await generateContractPdf(base);
    const signed = await generateContractPdf({ ...base, acceptance });
    expect(countPdfPages(signed.buffer)).toBe(countPdfPages(original.buffer) + 1);
    expect(signed.fileName).toBe('Contrato_102_v2_assinado.pdf');
    expect(signed.fileName).toBe(signedContractPdfFileName(102, 2));
    expect(original.fileName).toBe('Contrato_102_v2.pdf');
    expect(signed.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('contém o contrato original e todos os dados do comprovante', async () => {
    const text = extractPdfText((await generateContractPdf({ ...base, acceptance })).buffer);
    expect(text).toContain('O objeto é a consultoria jurídica.');
    expect(text).toContain('COMPROVANTE DE ACEITE ELETRÔNICO');
    expect(text).toContain('João da Silva');
    expect(text).toContain('*********25'); // CPF mascarado
    expect(text).toContain('05/10/2026'); // data do aceite (horário de Brasília)
    expect(text).toContain('11:03:09'); // hora do aceite em Brasília (14:03:09Z)
    expect(text).toContain('203.0.113.7'); // IP
    expect(text).toContain(SIGNATURE_HASH); // o MESMO hash já gravado no aceite
    expect(text).toContain('v1-2026-10'); // versão do texto de consentimento
    expect(text).toContain('Link público de uso único');
    expect(text).toContain('VERSÃO ACEITA');
  });

  it('nunca imprime o CPF completo', async () => {
    const text = extractPdfText((await generateContractPdf({ ...base, acceptance })).buffer);
    expect(text).not.toContain('52998224725');
    expect(text).not.toContain('529.982.247-25');
  });

  it('o PDF original (sem aceite) NÃO tem a página de comprovante', async () => {
    const text = extractPdfText((await generateContractPdf(base)).buffer);
    expect(text).not.toContain('COMPROVANTE DE ACEITE');
  });
});

// ---------------------------------------------------------------------------
// SignedPdfService: idempotência e tolerância a falha de storage
// ---------------------------------------------------------------------------

function makeService(opts: { storageFails?: boolean; existingDoc?: boolean } = {}) {
  const documents: any[] = [];
  const audits: any[] = [];
  const objects = new Map<string, Buffer>();
  const signature = {
    id: 'sig-1', officeId: 'office1', contractId: 'c-1', createdById: 'u-1', usedAt: SIGNED_AT, signedAt: SIGNED_AT,
    signerName: 'João da Silva', signerDocument: '52998224725', signerIp: '203.0.113.7', signatureHash: SIGNATURE_HASH,
    consentTextVersion: 'v1-2026-10',
    contractVersion: { versionNumber: 2, content: CONTENT, createdAt: new Date('2026-09-28T15:42:00Z') },
    contract: { id: 'c-1', number: 102 },
  };
  let counter = 0;
  const storage: any = {
    name: 'local',
    save: vi.fn(async ({ body, key }: any) => {
      if (opts.storageFails) throw new Error('storage indisponível');
      const k = key ?? `office1/obj-${(counter += 1)}.pdf`;
      objects.set(k, body);
      return { key: k, sizeBytes: body.byteLength };
    }),
    exists: vi.fn(async (k: string) => objects.has(k)),
    remove: vi.fn(async (k: string) => void objects.delete(k)),
    get: vi.fn(),
  };
  const prisma: any = {
    contractPublicSignature: {
      findUnique: vi.fn(async () => signature),
      findFirst: vi.fn(async () => ({ id: 'sig-1' })),
    },
    document: {
      findUnique: vi.fn(async ({ where }: any) => documents.find((d) => d.signatureId === where.signatureId) ?? null),
      findFirst: vi.fn(async ({ where }: any) => documents.find((d) => d.id === where.id) ?? null),
      create: vi.fn(async ({ data }: any) => {
        if (documents.some((d) => d.signatureId === data.signatureId)) {
          const { Prisma } = await import('@prisma/client');
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
        }
        const doc = { id: `doc-${documents.length + 1}`, ...data };
        documents.push(doc);
        return doc;
      }),
      update: vi.fn(),
    },
    office: { findUniqueOrThrow: vi.fn(async () => ({ id: 'office1', name: 'Silva & Associados' })) },
    auditLog: { create: vi.fn(async ({ data }: any) => void audits.push(data)) },
  };
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma));
  return { service: new SignedPdfService(prisma, storage), documents, audits, storage, objects, prisma };
}

describe('SignedPdfService', () => {
  it('assinatura gera o PDF final: Document ligado à assinatura, categoria CONTRATO, hash do arquivo', async () => {
    const { service, documents, storage, audits } = makeService();
    await service.generateAfterSignature('sig-1');

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      signatureId: 'sig-1', fileName: 'Contrato_102_v2_assinado.pdf', category: 'CONTRATO', mimeType: 'application/pdf', uploadedById: 'u-1',
    });
    expect(documents[0].contractVersionId).toBeUndefined(); // não ocupa o slot do PDF original
    const stored = storage.save.mock.calls[0][0].body as Buffer;
    expect(documents[0].contentHash).toBe(sha256Hex(stored));
    expect(documents[0].sizeBytes).toBe(stored.byteLength);
    expect(countPdfPages(stored)).toBeGreaterThanOrEqual(2);
    expect(audits[0]).toMatchObject({ action: 'gerou o PDF assinado do', actorLabel: 'Sistema', entityLabel: 'Contrato #102' });
    expect(JSON.stringify(audits)).not.toContain('52998224725');
  });

  it('execução duplicada e concorrente não cria dois PDFs', async () => {
    const { service, documents, objects } = makeService();
    const results = await Promise.all([service.ensureForSignature('sig-1', { actorId: null }), service.ensureForSignature('sig-1', { actorId: null })]);
    await service.generateAfterSignature('sig-1');
    expect(documents).toHaveLength(1);
    expect(new Set(results.map((r) => r.documentId)).size).toBe(1);
    // objeto perdedor da corrida é removido: sem arquivos órfãos no storage
    expect(objects.size).toBe(1);
  });

  it('falha de storage NÃO lança: registra auditoria para regeneração e não cria Document', async () => {
    const { service, documents, audits } = makeService({ storageFails: true });
    await expect(service.generateAfterSignature('sig-1')).resolves.toBeUndefined();
    expect(documents).toHaveLength(0);
    expect(audits[0]).toMatchObject({ action: 'não conseguiu gerar o PDF assinado do', actorLabel: 'Sistema' });
  });

  it('regenera sob demanda depois de uma falha (a assinatura continua válida)', async () => {
    const { service, documents } = makeService();
    const failing = makeService({ storageFails: true });
    await failing.service.generateAfterSignature('sig-1');
    expect(failing.documents).toHaveLength(0);
    const result = await service.ensureForSignature('sig-1', { actorId: 'user-9' });
    expect(result.created).toBe(true);
    expect(documents).toHaveLength(1);
  });

  it('restaura o objeto no storage quando o arquivo sumiu (mesma chave, sem novo Document)', async () => {
    const { service, documents, objects } = makeService();
    await service.ensureForSignature('sig-1', { actorId: null });
    const key = documents[0].storagePath;
    objects.delete(key);
    const again = await service.ensureForSignature('sig-1', { actorId: null });
    expect(again.created).toBe(false);
    expect(documents).toHaveLength(1);
    expect(objects.has(key)).toBe(true);
  });

  it('assinatura inexistente / não concluída → 404', async () => {
    const { service, prisma } = makeService();
    prisma.contractPublicSignature.findUnique.mockResolvedValueOnce({ id: 'sig-1', usedAt: null });
    await expect(service.ensureForSignature('sig-1', { actorId: null })).rejects.toMatchObject({ statusCode: 404 });
  });
});
