import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentService } from '../../src/modules/documents/document.service';
import { NotFoundError, ValidationError } from '../../src/shared/errors';
import { MemoryStorage, SAMPLE_PDF, streamToBuffer } from './helpers-storage';

const OFFICE_A = 'office-a';
const OFFICE_B = 'office-b';
const USER_A = { userId: 'user-a', officeId: OFFICE_A };
const USER_B = { userId: 'user-b', officeId: OFFICE_B };
const MAX = 1024 * 1024;

interface Row {
  id: string;
  officeId: string;
  contractId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  [key: string]: unknown;
}

/** Prisma falso com as mesmas cláusulas `where` que o service usa (id + officeId). */
function makePrisma() {
  const contracts = [
    { id: 'contract-a', officeId: OFFICE_A },
    { id: 'contract-b', officeId: OFFICE_B },
  ];
  const documents: Row[] = [];
  const audit: unknown[] = [];
  let seq = 0;

  const documentApi = {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { ...data, id: `doc-${(seq += 1)}`, createdAt: new Date() } as unknown as Row;
      documents.push(row);
      return row;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      documents.splice(documents.findIndex((d) => d.id === where.id), 1);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string; officeId: string } }) =>
      documents.find((d) => d.id === where.id && d.officeId === where.officeId) ?? null,
    ),
  };
  const tx = { document: documentApi, auditLog: { create: vi.fn(async ({ data }) => void audit.push(data)) } };

  const prisma = {
    contract: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; officeId: string } }) =>
        contracts.find((c) => c.id === where.id && c.officeId === where.officeId) ?? null,
      ),
    },
    document: documentApi,
    auditLog: tx.auditLog,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, documents, audit, tx };
}

describe('DocumentService', () => {
  let storage: MemoryStorage;
  let db: ReturnType<typeof makePrisma>;
  let service: DocumentService;

  const upload = (actor = USER_A, overrides: Partial<Parameters<DocumentService['upload']>[1]> = {}) =>
    service.upload(actor, {
      contractId: actor === USER_A ? 'contract-a' : 'contract-b',
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF,
      ...overrides,
    });

  beforeEach(() => {
    storage = new MemoryStorage();
    db = makePrisma();
    service = new DocumentService(db.prisma as unknown as PrismaClient, storage, MAX);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('upload', () => {
    it('salva no storage com chave {officeId}/{uuid}.pdf, cria o Document e audita', async () => {
      await upload();

      expect(storage.objects.size).toBe(1);
      const [key] = [...storage.objects.keys()];
      expect(key).toMatch(/^office-a\/[0-9a-f-]{36}\.pdf$/);
      expect(db.documents[0]).toMatchObject({
        officeId: OFFICE_A,
        fileName: 'contrato.pdf', // o nome original fica só como metadado
        mimeType: 'application/pdf',
        fileType: 'PDF',
        storagePath: key,
        sizeBytes: SAMPLE_PDF.byteLength,
      });
      expect(db.audit).toHaveLength(1);
    });

    it('usa o officeId da sessão na chave, nunca o nome do arquivo', async () => {
      await upload(USER_A, { fileName: '../../office-b/roubo.pdf' });
      const [key] = [...storage.objects.keys()];
      expect(key?.startsWith('office-a/')).toBe(true);
      expect(key).not.toContain('roubo');
      expect(db.documents[0]?.fileName).toBe('roubo.pdf');
    });

    it.each([
      ['MIME/extensão incompatíveis', { mimeType: 'image/png' }, /extensão/],
      ['conteúdo incompatível com o MIME', { buffer: Buffer.from('MZ este é um executável') }, /conteúdo/],
      ['extensão não permitida', { fileName: 'a.exe' }, /não permitido/],
      ['arquivo vazio', { buffer: Buffer.alloc(0) }, /vazio/],
      ['arquivo acima do limite', { buffer: Buffer.concat([SAMPLE_PDF, Buffer.alloc(MAX)]) }, /tamanho máximo/],
    ])('rejeita %s sem salvar nem criar Document', async (_label, overrides, message) => {
      await expect(upload(USER_A, overrides)).rejects.toThrow(message);
      expect(storage.objects.size).toBe(0);
      expect(db.documents).toHaveLength(0);
    });

    it('contrato inexistente → 404 sem tocar no storage', async () => {
      await expect(upload(USER_A, { contractId: 'nao-existe' })).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.objects.size).toBe(0);
    });

    it('contrato de OUTRO escritório → 404 sem tocar no storage', async () => {
      await expect(upload(USER_A, { contractId: 'contract-b' })).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.objects.size).toBe(0);
      expect(db.documents).toHaveLength(0);
    });

    it('falha do storage: erro propagado e nenhum Document criado', async () => {
      storage.failSave = new Error('SlowDown');
      await expect(upload()).rejects.toThrow('SlowDown');
      expect(db.documents).toHaveLength(0);
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('falha ao criar o registro remove o objeto órfão e preserva o erro original', async () => {
      db.prisma.$transaction.mockRejectedValueOnce(new Error('db caiu'));

      await expect(upload()).rejects.toThrow('db caiu');

      expect(storage.objects.size).toBe(0);
    });

    it('se a limpeza também falhar, o erro original continua sendo o lançado (e a falha é logada)', async () => {
      db.prisma.$transaction.mockRejectedValueOnce(new Error('db caiu'));
      storage.failRemove = new Error('storage fora do ar');

      await expect(upload()).rejects.toThrow('db caiu');

      expect(console.error).toHaveBeenCalled();
      expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain('office-a/');
    });
  });

  describe('multi-tenant (download)', () => {
    let docA: string;
    let docB: string;

    beforeEach(async () => {
      docA = (await upload(USER_A)).id;
      docB = (await upload(USER_B)).id;
    });

    it('office A → documento A: permitido, devolve o conteúdo por stream', async () => {
      const file = await service.getFileForDownload(OFFICE_A, docA);
      expect(file.fileName).toBe('contrato.pdf');
      expect(file.mimeType).toBe('application/pdf');
      expect((await streamToBuffer(file.stream)).equals(SAMPLE_PDF)).toBe(true);
    });

    it('office A → documento B: negado (404)', async () => {
      await expect(service.getFileForDownload(OFFICE_A, docB)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('office B → documento A: negado (404)', async () => {
      await expect(service.getFileForDownload(OFFICE_B, docA)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('a consulta ao banco sempre filtra por id + officeId', async () => {
      await service.getFileForDownload(OFFICE_A, docA);
      expect(db.prisma.document.findFirst.mock.calls.at(-1)?.[0]).toMatchObject({ where: { id: docA, officeId: OFFICE_A } });
    });

    it('não serve chave que não pertence ao escritório, mesmo com registro do próprio office', async () => {
      db.documents.find((d) => d.id === docA)!.storagePath = [...storage.objects.keys()].find((k) => k.startsWith('office-b/'))!;
      await expect(service.getFileForDownload(OFFICE_A, docA)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('objeto ausente no storage → 404 amigável', async () => {
      storage.objects.clear();
      await expect(service.getFileForDownload(OFFICE_A, docA)).rejects.toThrow(/não encontrado/);
    });

    it('remover documento de outro escritório é negado e não apaga o objeto', async () => {
      await expect(service.remove(USER_A, docB)).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.objects.size).toBe(2);
    });
  });

  describe('remove', () => {
    it('apaga o registro, audita e remove o objeto do storage', async () => {
      const { id } = await upload();
      await service.remove(USER_A, id);
      expect(db.documents).toHaveLength(0);
      expect(storage.objects.size).toBe(0);
      expect(db.audit).toHaveLength(2); // upload + remoção
    });

    it('falha ao remover o objeto não desfaz a remoção do registro nem lança erro', async () => {
      const { id } = await upload();
      storage.failRemove = new Error('storage fora do ar');
      await expect(service.remove(USER_A, id)).resolves.toBeUndefined();
      expect(db.documents).toHaveLength(0);
      expect(console.error).toHaveBeenCalled();
    });
  });

  it('ValidationError é o tipo lançado para arquivos inválidos (HTTP 400)', async () => {
    await expect(upload(USER_A, { fileName: 'a.exe' })).rejects.toBeInstanceOf(ValidationError);
  });
});
