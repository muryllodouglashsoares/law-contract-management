import type { Readable } from 'node:stream';

import { Prisma, type PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, SYSTEM_ACTOR_LABEL, writeAuditLog } from '../../shared/domain/audit';
import { NotFoundError } from '../../shared/errors';
import { generateContractPdf } from '../../shared/pdf/contract-pdf';
import { sha256OfString } from '../../shared/security/token';
import { getStorage, removeQuietly, type StorageDriver } from '../../shared/storage';
import { keyBelongsToOffice } from '../../shared/storage/storage-key';
import { StorageObjectNotFoundError } from '../../shared/storage/storage.types';
import { maskDocument } from '../../shared/utils/br-document';
import { sha256Hex } from '../../shared/utils/hash';

type PrismaDeps = Pick<PrismaClient, 'contractPublicSignature' | 'document' | 'office' | 'auditLog' | '$transaction'>;

export interface SignedPdfResult {
  documentId: string;
  /** true = o PDF foi criado nesta chamada; false = já existia (idempotência). */
  created: boolean;
}

export interface SignedPdfDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
}

/**
 * PDF FINAL com comprovante de aceite eletrônico.
 *
 *  - Ligado ao evento de assinatura por `Document.signatureId` (UNIQUE): no máximo UM PDF assinado
 *    por assinatura. O PDF original da versão continua em `Document.contractVersionId`.
 *  - Todos os dados vêm do registro de aceite no banco (nada do frontend); o CPF/CNPJ é mascarado
 *    com `maskDocument` antes de chegar ao gerador; o hash é o signatureHash JÁ gravado no aceite.
 *  - Idempotente e auto-reparável: se o objeto sumir do storage, é regenerado na mesma chave.
 *  - Falha secundária nunca desfaz a assinatura: `generateAfterSignature` captura qualquer erro,
 *    registra em auditoria e o PDF é (re)gerado depois sob demanda (GET /contracts/:id/signed-pdf).
 */
export class SignedPdfService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly storage: StorageDriver = getStorage(),
  ) {}

  /** Chamado logo após o commit do aceite. NUNCA lança. */
  async generateAfterSignature(signatureId: string): Promise<void> {
    try {
      await this.ensureForSignature(signatureId, { actorId: null });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ level: 'error', msg: 'Falha ao gerar o PDF assinado', signatureId, err: String(error) }));
      await this.recordFailure(signatureId);
    }
  }

  /** Gera (ou reaproveita) o PDF assinado de uma assinatura já concluída. */
  async ensureForSignature(signatureId: string, options: { actorId: string | null }): Promise<SignedPdfResult> {
    const signature = await this.prisma.contractPublicSignature.findUnique({
      where: { id: signatureId },
      include: {
        contractVersion: { select: { versionNumber: true, content: true, createdAt: true } },
        contract: { select: { id: true, number: true } },
      },
    });
    if (!signature || !signature.usedAt || !signature.signedAt || !signature.signatureHash || !signature.signerName || !signature.signerDocument) {
      throw new NotFoundError('Assinatura concluída não encontrada');
    }

    const existing = await this.prisma.document.findUnique({ where: { signatureId } });
    if (existing) {
      await this.restoreMissingObject(signature, existing);
      return { documentId: existing.id, created: false };
    }

    const pdf = await this.render(signature);
    const stored = await this.storage.save({
      officeId: signature.officeId,
      fileName: pdf.fileName,
      contentType: pdf.mimeType,
      body: pdf.buffer,
    });

    try {
      const document = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.document.create({
          data: {
            officeId: signature.officeId,
            contractId: signature.contractId,
            // Quem gerou o link de aceite é o "dono" do registro (o campo é obrigatório no modelo).
            uploadedById: signature.createdById,
            signatureId: signature.id,
            fileName: pdf.fileName,
            fileType: 'PDF',
            mimeType: pdf.mimeType,
            sizeBytes: stored.sizeBytes,
            category: 'CONTRATO',
            storagePath: stored.key,
            contentHash: pdf.contentHash,
          },
        });

        await writeAuditLog(tx, {
          officeId: signature.officeId,
          actorId: options.actorId,
          ...(options.actorId ? {} : { actorLabel: SYSTEM_ACTOR_LABEL }),
          action: AUDIT_ACTIONS.SIGNED_PDF_GENERATED,
          entityType: 'Contract',
          entityId: signature.contractId,
          entityLabel: `Contrato #${signature.contract.number}`,
        });

        return created;
      });
      return { documentId: document.id, created: true };
    } catch (error) {
      await removeQuietly(this.storage, stored.key, 'signedPdf.ensure');
      // Outra execução gerou primeiro (UNIQUE em signatureId): devolve o vencedor.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.document.findUnique({ where: { signatureId } });
        if (winner) return { documentId: winner.id, created: false };
      }
      throw error;
    }
  }

  /**
   * Abre o PDF assinado MAIS RECENTE do contrato (gerando-o sob demanda se ainda não existir —
   * cobre falhas de storage no momento do aceite e contratos assinados antes desta versão).
   */
  async getSignedPdfForDownload(officeId: string, contractId: string, actorId: string): Promise<SignedPdfDownload> {
    const signature = await this.prisma.contractPublicSignature.findFirst({
      where: { contractId, officeId, usedAt: { not: null }, signedAt: { not: null } },
      orderBy: { signedAt: 'desc' },
      select: { id: true },
    });
    if (!signature) throw new NotFoundError('Este contrato ainda não possui PDF assinado');

    const { documentId } = await this.ensureForSignature(signature.id, { actorId });
    const document = await this.prisma.document.findFirst({ where: { id: documentId, officeId } });
    if (!document || !keyBelongsToOffice(document.storagePath, officeId)) {
      throw new NotFoundError('PDF assinado não encontrado');
    }
    try {
      return { stream: await this.storage.get(document.storagePath), fileName: document.fileName, mimeType: document.mimeType };
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) throw new NotFoundError('Arquivo não encontrado no armazenamento');
      throw error;
    }
  }

  private async render(signature: {
    officeId: string;
    signerName: string | null;
    signerDocument: string | null;
    signedAt: Date | null;
    signerIp: string | null;
    signatureHash: string | null;
    consentTextVersion: string | null;
    contractVersion: { versionNumber: number; content: string; createdAt: Date };
    contract: { number: number };
  }) {
    const office = await this.prisma.office.findUniqueOrThrow({ where: { id: signature.officeId } });
    const generated = await generateContractPdf({
      contract: { number: signature.contract.number },
      version: {
        versionNumber: signature.contractVersion.versionNumber,
        content: signature.contractVersion.content,
        // O cabeçalho mostra a data da versão; os metadados do PDF usam a data do aceite (reprodutível).
        createdAt: signature.contractVersion.createdAt,
      },
      office,
      acceptance: {
        signerName: signature.signerName as string,
        signerDocumentMasked: maskDocument(signature.signerDocument as string),
        signedAt: signature.signedAt as Date,
        signerIp: signature.signerIp,
        signatureHash: signature.signatureHash as string,
        consentTextVersion: signature.consentTextVersion ?? '',
        contentHash: sha256OfString(signature.contractVersion.content),
      },
    });
    return { ...generated, contentHash: sha256Hex(generated.buffer) };
  }

  private async restoreMissingObject(
    signature: Parameters<SignedPdfService['render']>[0],
    document: { id: string; storagePath: string; contentHash: string | null; sizeBytes: number; mimeType: string },
  ): Promise<void> {
    if (!keyBelongsToOffice(document.storagePath, signature.officeId)) return;
    try {
      if (await this.storage.exists(document.storagePath)) return;
    } catch {
      return; // não foi possível verificar: não derruba a requisição
    }
    const pdf = await this.render(signature);
    await this.storage.save({
      officeId: signature.officeId,
      fileName: 'restore.pdf',
      contentType: pdf.mimeType,
      body: pdf.buffer,
      key: document.storagePath,
    });
    if (pdf.contentHash !== document.contentHash || pdf.buffer.byteLength !== document.sizeBytes) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { contentHash: pdf.contentHash, sizeBytes: pdf.buffer.byteLength },
      });
    }
  }

  private async recordFailure(signatureId: string): Promise<void> {
    try {
      const signature = await this.prisma.contractPublicSignature.findUnique({
        where: { id: signatureId },
        select: { officeId: true, contractId: true, contract: { select: { number: true } } },
      });
      if (!signature) return;
      await writeAuditLog(this.prisma, {
        officeId: signature.officeId,
        actorId: null,
        actorLabel: SYSTEM_ACTOR_LABEL,
        action: AUDIT_ACTIONS.SIGNED_PDF_FAILED,
        entityType: 'Contract',
        entityId: signature.contractId,
        entityLabel: `Contrato #${signature.contract.number}`,
      });
    } catch {
      // A auditoria da falha é best-effort; o PDF será regenerado sob demanda.
    }
  }
}
