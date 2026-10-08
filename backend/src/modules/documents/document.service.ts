import type { Readable } from 'node:stream';

import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { DOCUMENT_CATEGORY_FROM_API } from '../../shared/domain/status-map';
import { env } from '../../config/env';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import { getStorage, removeQuietly, type StorageDriver } from '../../shared/storage';
import { keyBelongsToOffice } from '../../shared/storage/storage-key';
import { StorageObjectNotFoundError } from '../../shared/storage/storage.types';
import { validateUpload } from '../../shared/storage/upload-validation';
import type { DocumentWithRelations } from '../../shared/utils/serialize-document';
import type { ListDocumentsQuery } from './document.schemas';

const DOCUMENT_INCLUDE = {
  contract: { select: { id: true, number: true, client: { select: { id: true, name: true } } } },
  uploadedBy: { select: { id: true, name: true } },
  contractVersion: { select: { versionNumber: true } },
  signature: { select: { contractVersion: { select: { versionNumber: true } } } },
};

export interface DocumentActor {
  userId: string;
  officeId: string;
}

export interface UploadDocumentInput {
  contractId: string;
  category?: string;
  fileName: string;
  /** MIME declarado pelo cliente — só é conferido; o MIME gravado é o canônico do formato validado. */
  mimeType: string;
  buffer: Buffer;
}

export interface DocumentDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
}

export class DocumentService {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'document' | 'contract' | 'auditLog' | '$transaction'>,
    private readonly storage: StorageDriver = getStorage(),
    private readonly maxUploadBytes: number = env.MAX_UPLOAD_SIZE_BYTES,
  ) {}

  async list(officeId: string, query: ListDocumentsQuery): Promise<Paginated<DocumentWithRelations>> {
    const where: Prisma.DocumentWhereInput = {
      officeId,
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.clientId ? { contract: { clientId: query.clientId } } : {}),
      ...(query.category ? { category: DOCUMENT_CATEGORY_FROM_API(query.category) } : {}),
      ...(query.search ? { fileName: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: DOCUMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.document.count({ where }),
    ]);

    return toPaginated(data as DocumentWithRelations[], total, query as PaginationQuery);
  }

  async getById(officeId: string, id: string): Promise<DocumentWithRelations> {
    const document = await this.prisma.document.findFirst({
      where: { id, officeId },
      include: DOCUMENT_INCLUDE,
    });

    if (!document) {
      throw new NotFoundError('Documento não encontrado');
    }

    return document as DocumentWithRelations;
  }

  /**
   * Ordem (o storage NÃO participa da transação do Prisma):
   *   1. valida usuário/escritório → contrato → arquivo (tipo real, tamanho);
   *   2. grava o objeto no storage;
   *   3. cria Document + auditoria em uma transação;
   *   4. se o passo 3 falhar, remove o objeto do passo 2 (sem mascarar o erro original).
   * Assim nunca sobra registro apontando para arquivo inexistente; no pior caso
   * (remoção falhar) sobra um objeto órfão, registrado no log com a chave.
   */
  async upload(actor: DocumentActor, input: UploadDocumentInput): Promise<DocumentWithRelations> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: input.contractId, officeId: actor.officeId },
    });
    if (!contract) {
      throw new NotFoundError('Contrato não encontrado');
    }

    const file = validateUpload(
      { fileName: input.fileName, declaredMimeType: input.mimeType, buffer: input.buffer },
      { maxBytes: this.maxUploadBytes },
    );

    const stored = await this.storage.save({
      officeId: actor.officeId,
      fileName: file.fileName,
      contentType: file.mimeType,
      body: input.buffer,
    });

    let created;
    try {
      created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const document = await tx.document.create({
          data: {
            officeId: actor.officeId,
            contractId: contract.id,
            uploadedById: actor.userId,
            fileName: file.fileName,
            fileType: file.fileType,
            mimeType: file.mimeType,
            sizeBytes: stored.sizeBytes,
            category: input.category ? DOCUMENT_CATEGORY_FROM_API(input.category) : 'DOCUMENTO',
            storagePath: stored.key,
          },
        });

        await writeAuditLog(tx, {
          officeId: actor.officeId,
          actorId: actor.userId,
          action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
          entityType: 'Document',
          entityId: document.id,
          entityLabel: document.fileName,
        });

        return document;
      });
    } catch (error) {
      await removeQuietly(this.storage, stored.key, 'document.upload');
      throw error;
    }

    return this.getById(actor.officeId, created.id);
  }

  /** Abre o arquivo por stream. Só chega ao storage depois de achar o Document com `{ id, officeId }`. */
  async getFileForDownload(officeId: string, id: string): Promise<DocumentDownload> {
    const document = await this.getById(officeId, id); // 404 para documento de outro escritório

    // Defesa em profundidade: a chave gravada tem de pertencer ao escritório autenticado.
    if (!keyBelongsToOffice(document.storagePath, officeId)) {
      throw new NotFoundError('Documento não encontrado');
    }

    try {
      const stream = await this.storage.get(document.storagePath);
      return { stream, fileName: document.fileName, mimeType: document.mimeType };
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw new NotFoundError('Arquivo não encontrado no armazenamento');
      }
      throw error;
    }
  }

  async remove(actor: DocumentActor, id: string): Promise<void> {
    const document = await this.getById(actor.officeId, id);
    if (document.signatureId) {
      throw new ConflictError('O PDF assinado é o comprovante do aceite eletrônico e não pode ser removido');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.document.delete({ where: { id } });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.DOCUMENT_DELETED,
        entityType: 'Document',
        entityId: id,
        entityLabel: document.fileName,
      });
    });

    // Banco primeiro, storage depois: se a remoção do objeto falhar, sobra apenas um
    // objeto órfão (inofensivo, logado) — nunca um Document apontando para arquivo inexistente.
    await removeQuietly(this.storage, document.storagePath, 'document.remove');
  }
}
