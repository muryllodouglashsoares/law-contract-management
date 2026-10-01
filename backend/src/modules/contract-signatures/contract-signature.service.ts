import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, SYSTEM_ACTOR_LABEL, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { SIGNABLE_CONTRACT_STATUSES } from '../../shared/domain/status-map';
import { ConflictError, GoneError, NotFoundError } from '../../shared/errors';
import {
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  computeSignatureHash,
} from '../../shared/security/signature-hash';
import { generatePublicToken, hashPublicToken, sha256OfString } from '../../shared/security/token';
import { toMoneyNumber } from '../../shared/utils/money';
import { maskDocument } from '../../shared/utils/br-document';
import type { SignContractBody } from './contract-signature.schemas';

type PrismaDeps = Pick<
  PrismaClient,
  'contract' | 'contractPublicSignature' | 'notification' | 'auditLog' | '$transaction'
>;

export interface SignatureServiceConfig {
  /** Origem do frontend (sem barra final). Nunca derivada do header Host. */
  publicAppUrl: string | undefined;
  expirationHours: number;
}

export interface SignatureActor {
  userId: string;
  officeId: string;
}

export interface SignatureRequestContext {
  /** request.ip do Fastify (trustProxy) — nunca um valor enviado no body. */
  ip: string | null;
  userAgent: string | null;
}

export const SIGNATURE_ERROR_CODES = {
  INVALID: 'SIGNATURE_LINK_INVALID',
  EXPIRED: 'SIGNATURE_LINK_EXPIRED',
  USED: 'SIGNATURE_LINK_USED',
} as const;

const INVALID_MESSAGE = 'Link de assinatura inválido ou indisponível.';

export type SignatureLinkState = 'active' | 'used' | 'expired' | 'revoked';

export function signatureLinkState(
  sig: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): SignatureLinkState {
  if (sig.usedAt) return 'used';
  if (sig.revokedAt) return 'revoked';
  if (sig.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export class ContractSignatureService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly config: SignatureServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // -------------------------------------------------------------------
  // Área autenticada (ADMIN/LAWYER — a checagem de papel fica na rota)
  // -------------------------------------------------------------------

  /** Gera um link de uso único atrelado à versão ATUAL do contrato. */
  async createLink(
    actor: SignatureActor,
    contractId: string,
  ): Promise<{ url: string; expiresAt: Date; singleUse: true; signatureId: string; versionNumber: number }> {
    if (!this.config.publicAppUrl) {
      throw new ConflictError('A URL pública do sistema não está configurada no servidor (PUBLIC_APP_URL).');
    }

    // officeId sempre vem do usuário autenticado: contrato de outro escritório = 404.
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, officeId: actor.officeId },
      select: {
        id: true,
        number: true,
        status: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, versionNumber: true } },
      },
    });
    if (!contract) throw new NotFoundError('Contrato não encontrado');

    if (!SIGNABLE_CONTRACT_STATUSES.includes(contract.status)) {
      throw new ConflictError('Só é possível gerar o link de aceite para contratos enviados ou em revisão.');
    }

    const version = contract.versions[0];
    if (!version) throw new ConflictError('O contrato não possui uma versão para ser aceita.');

    const token = generatePublicToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.config.expirationHours * 60 * 60 * 1000);

    const signature = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Um único link ativo por contrato: links anteriores ainda não usados são invalidados.
      await tx.contractPublicSignature.updateMany({
        where: { contractId: contract.id, officeId: actor.officeId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });

      const created = await tx.contractPublicSignature.create({
        data: {
          officeId: actor.officeId,
          contractId: contract.id,
          contractVersionId: version.id,
          createdById: actor.userId,
          tokenHash: hashPublicToken(token), // o token bruto nunca é persistido
          expiresAt,
        },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.SIGNATURE_LINK_CREATED,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: `Contrato #${contract.number}`,
      });

      return created;
    });

    return {
      url: `${this.config.publicAppUrl}/assinar/${token}`,
      expiresAt,
      singleUse: true,
      signatureId: signature.id,
      versionNumber: version.versionNumber,
    };
  }

  /** Histórico de links/aceites do contrato (sem token nem tokenHash). */
  async listForContract(officeId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, officeId }, select: { id: true } });
    if (!contract) throw new NotFoundError('Contrato não encontrado');

    const now = this.now();
    const rows = await this.prisma.contractPublicSignature.findMany({
      where: { contractId, officeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { contractVersion: { select: { versionNumber: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      state: signatureLinkState(row, now),
      versionNumber: row.contractVersion.versionNumber,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      signedAt: row.signedAt,
      signerName: row.signerName,
      signerDocumentMasked: row.signerDocument ? maskDocument(row.signerDocument) : null,
      signerIp: row.signerIp,
      signatureHash: row.signatureHash,
    }));
  }

  // -------------------------------------------------------------------
  // Área pública (sem JWT — o token é a credencial)
  // -------------------------------------------------------------------

  /** Dados mínimos para o signatário ler e decidir. Valida tudo no backend. */
  async getPublicView(token: string) {
    const sig = await this.loadAndValidate(token);

    return {
      officeName: sig.contract.office.name,
      contract: {
        number: sig.contract.number,
        object: sig.contract.object,
        value: toMoneyNumber(sig.contract.value),
        startDate: sig.contract.startDate.toISOString(),
        endDate: sig.contract.endDate ? sig.contract.endDate.toISOString() : null,
        clientName: sig.contract.client.name,
      },
      version: {
        versionNumber: sig.contractVersion.versionNumber,
        content: sig.contractVersion.content,
        createdAt: sig.contractVersion.createdAt.toISOString(),
      },
      expiresAt: sig.expiresAt.toISOString(),
      singleUse: true as const,
      consent: { text: CONSENT_TEXT, version: CONSENT_TEXT_VERSION },
    };
  }

  /**
   * Registra o aceite. Garantias (todas no banco, dentro de UMA transação):
   *  1. uso único: UPDATE ... WHERE usedAt IS NULL AND revokedAt IS NULL AND expiresAt > now.
   *     Requisições concorrentes serializam no lock da linha; só uma vê count = 1.
   *  2. o contrato só vira ASSINADO se ainda estiver em ENVIADO/EM_REVISAO; senão a
   *     transação inteira é revertida (o link NÃO fica "gasto").
   *  3. IP, user-agent e signedAt são definidos aqui, pelo servidor.
   */
  async sign(token: string, body: SignContractBody, context: SignatureRequestContext) {
    const sig = await this.loadAndValidate(token);
    const signedAt = this.now();

    const signatureHash = computeSignatureHash({
      signatureId: sig.id,
      contractId: sig.contractId,
      contractVersionId: sig.contractVersionId,
      versionNumber: sig.contractVersion.versionNumber,
      contentHash: sha256OfString(sig.contractVersion.content),
      signerName: body.signerName,
      signerDocument: body.signerDocument,
      signerIp: context.ip,
      signedAt,
      consentTextVersion: CONSENT_TEXT_VERSION,
    });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.contractPublicSignature.updateMany({
        where: { id: sig.id, usedAt: null, revokedAt: null, expiresAt: { gt: signedAt } },
        data: {
          usedAt: signedAt,
          signedAt,
          signerName: body.signerName,
          signerDocument: body.signerDocument,
          signerIp: context.ip,
          signerUserAgent: context.userAgent,
          consentTextVersion: CONSENT_TEXT_VERSION,
          signatureHash,
        },
      });
      if (claimed.count !== 1) {
        throw new GoneError(SIGNATURE_ERROR_CODES.USED, 'Este link de assinatura já foi utilizado ou não está mais disponível.');
      }

      const moved = await tx.contract.updateMany({
        where: { id: sig.contractId, officeId: sig.officeId, status: { in: SIGNABLE_CONTRACT_STATUSES } },
        data: { status: 'ASSINADO' },
      });
      if (moved.count !== 1) {
        throw new GoneError(SIGNATURE_ERROR_CODES.INVALID, INVALID_MESSAGE);
      }

      await writeAuditLog(tx, {
        officeId: sig.officeId,
        actorId: null,
        actorLabel: SYSTEM_ACTOR_LABEL,
        action: AUDIT_ACTIONS.ELECTRONIC_SIGNED,
        entityType: 'Contract',
        entityId: sig.contractId,
        // Sem CPF, token ou IP aqui: o rótulo aparece na tela de histórico.
        entityLabel: `Contrato #${sig.contract.number}`,
      });

      await createNotification(tx, {
        officeId: sig.officeId,
        userId: sig.contract.responsibleId,
        type: 'SUCCESS',
        title: 'Contrato assinado eletronicamente',
        description: `O contrato #${sig.contract.number} de ${sig.contract.client.name} recebeu o aceite eletrônico de ${body.signerName}.`,
        priority: true,
      });
    });

    return {
      signed: true as const,
      signedAt,
      signatureId: sig.id,
      signatureHash,
      signerName: body.signerName,
      contractNumber: sig.contract.number,
    };
  }

  /**
   * Localiza pelo SHA-256 do token e valida estado. Ordem importa só para a mensagem:
   * token desconhecido → 404 genérico; demais estados → 410 com código específico.
   */
  private async loadAndValidate(token: string) {
    const sig = await this.prisma.contractPublicSignature.findUnique({
      where: { tokenHash: hashPublicToken(token) },
      include: {
        contractVersion: { select: { id: true, versionNumber: true, content: true, createdAt: true } },
        contract: {
          select: {
            id: true,
            number: true,
            status: true,
            value: true,
            object: true,
            startDate: true,
            endDate: true,
            responsibleId: true,
            client: { select: { name: true } },
            office: { select: { name: true } },
            versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true } },
          },
        },
      },
    });

    if (!sig) throw new NotFoundError(INVALID_MESSAGE);

    if (sig.usedAt) {
      throw new GoneError(SIGNATURE_ERROR_CODES.USED, 'Este link de assinatura já foi utilizado.');
    }
    if (sig.revokedAt) {
      throw new GoneError(SIGNATURE_ERROR_CODES.INVALID, 'Este link foi substituído por um mais recente e não é mais válido.');
    }
    if (sig.expiresAt.getTime() <= this.now().getTime()) {
      throw new GoneError(SIGNATURE_ERROR_CODES.EXPIRED, 'Este link de assinatura expirou. Solicite um novo link ao escritório.');
    }

    // O aceite é sempre da versão para a qual o link foi gerado: se o contrato mudou de
    // status ou ganhou uma versão mais nova, o link deixa de valer (nunca aceita outra versão).
    const latest = sig.contract.versions[0];
    if (!SIGNABLE_CONTRACT_STATUSES.includes(sig.contract.status) || !latest || latest.id !== sig.contractVersionId) {
      throw new GoneError(SIGNATURE_ERROR_CODES.INVALID, INVALID_MESSAGE);
    }

    return sig;
  }
}
