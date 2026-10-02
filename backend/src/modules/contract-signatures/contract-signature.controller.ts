import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../../config/env';
import { prisma } from '../../shared/database/prisma';
import type { ContractIdParams } from '../contracts/contract.schemas';
import { pushService } from '../notifications/push.instance';
import type { PublicTokenParams, SignContractBody } from './contract-signature.schemas';
import { ContractSignatureService } from './contract-signature.service';

export function createSignatureService(): ContractSignatureService {
  return new ContractSignatureService(prisma, {
    // Nunca derivado do header Host. Em desenvolvimento há um padrão local; em produção é obrigatório.
    publicAppUrl: env.PUBLIC_APP_URL ?? (env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173'),
    expirationHours: env.PUBLIC_SIGNATURE_EXPIRATION_HOURS,
    push: pushService,
  });
}

const signatureService = createSignatureService();

/** Respostas que contêm/derivam de um token nunca devem ser cacheadas nem indexadas. */
function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
  reply.header('X-Robots-Tag', 'noindex, nofollow');
}

export const contractSignatureController = {
  // --- autenticado ---------------------------------------------------
  async createLink(request: FastifyRequest<{ Params: ContractIdParams }>, reply: FastifyReply) {
    const link = await signatureService.createLink(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
    );
    noStore(reply);
    return reply.status(201).send({
      url: link.url,
      expiresAt: link.expiresAt.toISOString(),
      singleUse: link.singleUse,
      versionNumber: link.versionNumber,
    });
  },

  async list(request: FastifyRequest<{ Params: ContractIdParams }>, reply: FastifyReply) {
    const rows = await signatureService.listForContract(request.user.officeId, request.params.id);
    return reply.status(200).send({
      data: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        signedAt: row.signedAt ? row.signedAt.toISOString() : null,
      })),
    });
  },

  // --- público (sem JWT) ----------------------------------------------
  async publicView(request: FastifyRequest<{ Params: PublicTokenParams }>, reply: FastifyReply) {
    const view = await signatureService.getPublicView(request.params.token);
    noStore(reply);
    return reply.status(200).send(view);
  },

  async publicSign(
    request: FastifyRequest<{ Params: PublicTokenParams; Body: SignContractBody }>,
    reply: FastifyReply,
  ) {
    const userAgent = request.headers['user-agent'];
    const result = await signatureService.sign(request.params.token, request.body, {
      // IP resolvido pelo Fastify (trustProxy). O body nunca é fonte de IP/data.
      ip: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null,
    });
    noStore(reply);
    return reply.status(201).send({
      signed: result.signed,
      signedAt: result.signedAt.toISOString(),
      signatureId: result.signatureId,
      signatureHash: result.signatureHash,
      signerName: result.signerName,
      contractNumber: result.contractNumber,
    });
  },
};
