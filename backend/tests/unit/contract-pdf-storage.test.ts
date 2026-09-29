import { Prisma, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContractService } from '../../src/modules/contracts/contract.service';
import { NotFoundError } from '../../src/shared/errors';
import { sha256Hex } from '../../src/shared/utils/hash';
import { MemoryStorage } from './helpers-storage';

const OFFICE = 'office-a';
const ACTOR = { userId: 'user-a', officeId: OFFICE };

const version = (versionNumber: number, content: string) => ({
  id: `version-${versionNumber}`,
  contractId: 'contract-1',
  versionNumber,
  content,
  createdAt: new Date('2026-01-10T12:00:00Z'),
});

/** Prisma falso: contrato com duas versões e uma tabela de documentos em memória. */
function makePrisma(versions = [version(2, 'CLÁUSULA PRIMEIRA\nTexto da versão dois.'), version(1, 'CLÁUSULA PRIMEIRA\nTexto da versão um.')]) {
  const documents: Record<string, unknown>[] = [];
  const contract = { id: 'contract-1', officeId: OFFICE, number: 7, versions: [versions[0]] };

  const documentApi = {
    findUnique: vi.fn(async ({ where }: { where: { contractVersionId: string } }) =>
      documents.find((d) => d.contractVersionId === where.contractVersionId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `doc-${documents.length + 1}`, ...data };
      documents.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = documents.find((d) => d.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  };
  const tx = { document: documentApi, auditLog: { create: vi.fn() } };

  const prisma = {
    contract: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; officeId: string } }) =>
        where.id === contract.id && where.officeId === OFFICE ? contract : null,
      ),
    },
    contractVersion: {
      findFirst: vi.fn(async ({ where }: { where: { contractId: string; versionNumber: number } }) =>
        versions.find((v) => v.versionNumber === where.versionNumber && v.contractId === where.contractId) ?? null,
      ),
    },
    office: { findUniqueOrThrow: vi.fn(async () => ({ id: OFFICE, name: 'Escritório Teste' })) },
    document: documentApi,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, documents, tx };
}

describe('ContractService.generatePdf (storage + SHA-256)', () => {
  let storage: MemoryStorage;
  let db: ReturnType<typeof makePrisma>;
  let service: ContractService;

  beforeEach(() => {
    storage = new MemoryStorage();
    db = makePrisma();
    service = new ContractService(db.prisma as unknown as PrismaClient, storage);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('gera o PDF da versão, calcula o SHA-256 do mesmo Buffer salvo e grava no Document', async () => {
    const result = await service.generatePdf(ACTOR, 'contract-1');

    expect(result.created).toBe(true);
    const row = db.documents[0]!;
    const [key, bytes] = [...storage.objects.entries()][0]!;
    expect(key).toMatch(/^office-a\/[0-9a-f-]{36}\.pdf$/);
    expect(row.storagePath).toBe(key);
    expect(bytes!.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(row.contentHash).toBe(sha256Hex(bytes!));
    expect(row.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.sizeBytes).toBe(bytes!.byteLength);
    expect(row).toMatchObject({ fileType: 'PDF', category: 'CONTRATO', contractVersionId: 'version-2', officeId: OFFICE });
  });

  it('o conteúdo vem da ContractVersion: versões diferentes → PDFs e hashes diferentes', async () => {
    await service.generatePdf(ACTOR, 'contract-1', { versionNumber: 1 });
    await service.generatePdf(ACTOR, 'contract-1', { versionNumber: 2 });

    expect(db.documents).toHaveLength(2);
    expect(db.documents[0]!.contentHash).not.toBe(db.documents[1]!.contentHash);
    expect(db.documents.map((d) => d.contractVersionId)).toEqual(['version-1', 'version-2']);
  });

  it('o mesmo conteúdo produz sempre o mesmo hash (PDF determinístico)', async () => {
    const other = makePrisma();
    const service2 = new ContractService(other.prisma as unknown as PrismaClient, new MemoryStorage());

    await service.generatePdf(ACTOR, 'contract-1');
    await service2.generatePdf(ACTOR, 'contract-1');

    expect(other.documents[0]!.contentHash).toBe(db.documents[0]!.contentHash);
  });

  it('é idempotente: segunda chamada reutiliza o documento, sem novo objeto', async () => {
    const first = await service.generatePdf(ACTOR, 'contract-1');
    const second = await service.generatePdf(ACTOR, 'contract-1');

    expect(second).toEqual({ documentId: first.documentId, created: false });
    expect(storage.objects.size).toBe(1);
    expect(db.documents).toHaveLength(1);
  });

  it('se o objeto sumiu do storage, regenera na mesma chave com o mesmo hash', async () => {
    const { documentId } = await service.generatePdf(ACTOR, 'contract-1');
    const row = db.documents[0]!;
    const originalHash = row.contentHash;
    storage.objects.clear();

    const again = await service.generatePdf(ACTOR, 'contract-1');

    expect(again).toEqual({ documentId, created: false });
    expect(storage.objects.has(row.storagePath as string)).toBe(true);
    expect(sha256Hex(storage.objects.get(row.storagePath as string)!)).toBe(originalHash);
    expect(db.documents).toHaveLength(1);
    expect(db.prisma.document.update).not.toHaveBeenCalled(); // hash idêntico: nada a corrigir
  });

  it('contrato de outro escritório e versão inexistente → 404, sem gravar nada', async () => {
    await expect(service.generatePdf({ userId: 'x', officeId: 'office-b' }, 'contract-1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.generatePdf(ACTOR, 'contract-1', { versionNumber: 99 })).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.objects.size).toBe(0);
  });

  it('falha do storage: nenhum Document é criado', async () => {
    storage.failSave = new Error('SlowDown');
    await expect(service.generatePdf(ACTOR, 'contract-1')).rejects.toThrow('SlowDown');
    expect(db.documents).toHaveLength(0);
  });

  it('falha ao criar o registro remove o objeto órfão e preserva o erro original', async () => {
    db.prisma.$transaction.mockRejectedValueOnce(new Error('db caiu'));
    await expect(service.generatePdf(ACTOR, 'contract-1')).rejects.toThrow('db caiu');
    expect(storage.objects.size).toBe(0);
  });

  it('corrida (P2002): remove o objeto duplicado e devolve o documento vencedor', async () => {
    const winner = { id: 'doc-winner', contractVersionId: 'version-2' };
    db.prisma.document.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    db.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );

    const result = await service.generatePdf(ACTOR, 'contract-1');

    expect(result).toEqual({ documentId: 'doc-winner', created: false });
    expect(storage.objects.size).toBe(0);
  });
});
