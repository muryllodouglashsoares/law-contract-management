import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../database/prisma';
import { AuthorizationError } from '../errors';

type Db = { office: Pick<PrismaClient['office'], 'findUnique'> };

/**
 * Criar/editar contratos: ADMIN e LAWYER sempre. ASSISTANT SOMENTE quando o escritório habilitou a
 * aprovação interna (`requireInternalApproval`) — nesse fluxo o assistente redige e envia para revisão,
 * mas nunca envia ao cliente nem aprova. Com a aprovação desligada, o comportamento anterior
 * (somente ADMIN/LAWYER) é preservado. A consulta é sempre pelo officeId da SESSÃO.
 */
export function createRequireContractAuthor(db: Db) {
  return async function requireContractAuthor(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const { role, officeId } = request.user;
    if (role === 'ADMIN' || role === 'LAWYER') return;

    const office = await db.office.findUnique({ where: { id: officeId }, select: { requireInternalApproval: true } });
    if (role === 'ASSISTANT' && office?.requireInternalApproval) return;

    throw new AuthorizationError('Você não tem permissão para executar esta ação');
  };
}

export const requireContractAuthor = createRequireContractAuthor(prisma);
