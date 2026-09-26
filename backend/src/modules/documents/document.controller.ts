import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';

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

    let buffer: Buffer;
    try {
      buffer = await filePart.toBuffer();
    } catch {
      throw new ValidationError('Arquivo excede o tamanho máximo permitido');
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
    reply.type(file.mimeType);
    return reply.send(createReadStream(file.absolutePath));
  },

  async remove(request: FastifyRequest<{ Params: DocumentIdParams }>, reply: FastifyReply) {
    await documentService.remove(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
    );
    return reply.status(204).send();
  },
};
