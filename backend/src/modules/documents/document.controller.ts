import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { ValidationError } from '../../shared/errors';
import { toPublicDocument } from '../../shared/utils/serialize-document';
import { uploadDocumentFieldsSchema, type DocumentIdParams, type ListDocumentsQuery } from './document.schemas';
import { DocumentService } from './document.service';

const documentService = new DocumentService(prisma);

/** Extrai o valor de um campo de texto de um multipart part (fastify/multipart). */
function fieldValue(fields: Record<string, unknown>, key: string): string | undefined {
  const field = fields[key] as { value?: unknown } | undefined;
  return typeof field?.value === 'string' ? field.value : undefined;
}

export const documentController = {
  async list(request: FastifyRequest<{ Querystring: ListDocumentsQuery }>, reply: FastifyReply) {
    const result = await documentService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map(toPublicDocument),
      pagination: result.pagination,
    });
  },

  async getById(request: FastifyRequest<{ Params: DocumentIdParams }>, reply: FastifyReply) {
    const document = await documentService.getById(request.user.officeId, request.params.id);
    return reply.status(200).send({ document: toPublicDocument(document) });
  },

  async upload(request: FastifyRequest, reply: FastifyReply) {
    const filePart = await request.file();
    if (!filePart) {
      throw new ValidationError('Nenhum arquivo enviado');
    }

    const parsedFields = uploadDocumentFieldsSchema.safeParse({
      contractId: fieldValue(filePart.fields, 'contractId'),
      category: fieldValue(filePart.fields, 'category'),
    });

    if (!parsedFields.success) {
      throw new ValidationError(
        'Dados inválidos no upload',
        parsedFields.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    // O limite (MAX_UPLOAD_SIZE_BYTES) é aplicado pelo @fastify/multipart durante a leitura:
    // ao estourar, o stream é interrompido e nada é salvo nem registrado.
    let buffer: Buffer;
    try {
      buffer = await filePart.toBuffer();
    } catch (error) {
      if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new ValidationError('Arquivo excede o tamanho máximo permitido');
      }
      throw error;
    }

    const document = await documentService.upload(
      { userId: request.user.userId, officeId: request.user.officeId },
      {
        ...parsedFields.data,
        fileName: filePart.filename,
        mimeType: filePart.mimetype,
        buffer,
      },
    );

    return reply.status(201).send({ document: toPublicDocument(document) });
  },

  async download(request: FastifyRequest<{ Params: DocumentIdParams }>, reply: FastifyReply) {
    const file = await documentService.getFileForDownload(request.user.officeId, request.params.id);

    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    // Documentos jurídicos são privados: nada de cache compartilhado nem sniffing de tipo.
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.type(file.mimeType);
    return reply.send(file.stream);
  },

  async remove(request: FastifyRequest<{ Params: DocumentIdParams }>, reply: FastifyReply) {
    await documentService.remove(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
    );
    return reply.status(204).send();
  },
};
