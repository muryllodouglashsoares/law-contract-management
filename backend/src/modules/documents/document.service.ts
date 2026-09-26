import path from 'node:path';

import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { DOCUMENT_CATEGORY_FROM_API } from '../../shared/domain/status-map';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import { absolutePath, removeFile, saveFile } from '../../shared/storage/local-file-storage';
import type { DocumentWithRelations } from '../../shared/utils/serialize-document';
import type { ListDocumentsQuery } from './document.schemas';

const DOCUMENT_INCLUDE = {
  contract: { select: { id: true, number: true, client: { select: { id: true, name: true } } } },
  uploadedBy: { select: { id: true, name: true } },
};

export interface DocumentActor {
  userId: string;
  officeId: string;
}

export interface UploadDocumentInput {
  contractId: string;
  category?: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export class DocumentService {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'document' | 'contract' | 'auditLog' | '$transaction'>,
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

  async upload(actor: DocumentActor, input: UploadDocumentInput): Promise<DocumentWithRelations> {
    if (!input.fileName) {
      throw new ValidationError('Nome do arquivo é obrigatório');
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: input.contractId, officeId: actor.officeId },
    });
    if (!contract) {
      throw new NotFoundError('Contrato não encontrado');
    }

    const saved = await saveFile(actor.officeId, input.fileName, input.buffer);
    const fileType = path.extname(input.fileName).replace('.', '').toUpperCase() || 'ARQUIVO';

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const document = await tx.document.create({
        data: {
          officeId: actor.officeId,
          contractId: contract.id,
          uploadedById: actor.userId,
          fileName: input.fileName,
          fileType,
          mimeType: input.mimeType,
          sizeBytes: saved.sizeBytes,
          category: input.category ? DOCUMENT_CATEGORY_FROM_API(input.category) : 'DOCUMENTO',
          storagePath: saved.storagePath,
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

    return this.getById(actor.officeId, created.id);
  }

  async getFileForDownload(
    officeId: string,
    id: string,
  ): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const document = await this.getById(officeId, id);
    return {
      absolutePath: absolutePath(document.storagePath),
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
  }

  async remove(actor: DocumentActor, id: string): Promise<void> {
    const document = await this.getById(actor.officeId, id);

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

    await removeFile(document.storagePath);
  }
}
