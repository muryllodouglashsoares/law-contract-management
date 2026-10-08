import type { Prisma, PrismaClient, UserRole } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { AuthorizationError, ConflictError, NotFoundError } from '../../shared/errors';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher';
import { PUSH_EVENT_TYPES } from '../notifications/push.types';

export interface ReviewActor {
  userId: string;
  officeId: string;
  role: UserRole;
}

type PrismaDeps = Pick<PrismaClient, 'contract' | 'office' | 'user' | 'notification' | 'auditLog' | '$transaction'>;

const REVIEWER_ROLES: UserRole[] = ['ADMIN', 'LAWYER'];

/**
 * Fluxo de aprovação interna (o backend é a fonte da verdade — o frontend só reflete):
 *
 *   ASSISTANT/qualquer autor: RASCUNHO ──submit──► PRONTO_ENVIO (aguardando revisão)
 *   ADMIN/LAWYER:             PRONTO_ENVIO ──approve──► APROVADO ──(status)──► ENVIADO
 *                             PRONTO_ENVIO/APROVADO ──reject(motivo)──► RASCUNHO
 *
 * Com `Office.requireInternalApproval` ligado, o envio ao cliente só sai de APROVADO (ver
 * isTransitionBlockedForGenericStatusUpdate). Todas as transições usam UPDATE condicional por
 * status (corrida entre dois revisores = só um vence) e filtram por officeId.
 */
export class ContractReviewService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly dispatcher?: NotificationDispatcher,
  ) {}

  async submit(actor: ReviewActor, contractId: string) {
    const office = await this.prisma.office.findUnique({ where: { id: actor.officeId }, select: { requireInternalApproval: true } });
    if (!office?.requireInternalApproval) {
      throw new ConflictError('A aprovação interna não está habilitada neste escritório');
    }

    const contract = await this.loadContract(actor.officeId, contractId);
    if (actor.role === 'ASSISTANT' && contract.responsibleId !== actor.userId) {
      throw new AuthorizationError('Você só pode enviar para revisão os contratos pelos quais é responsável');
    }
    if (contract.status !== 'RASCUNHO') {
      throw new ConflictError('Só é possível enviar para revisão um contrato em rascunho');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const moved = await tx.contract.updateMany({
        where: { id: contractId, officeId: actor.officeId, status: 'RASCUNHO' },
        data: {
          status: 'PRONTO_ENVIO',
          reviewSubmittedAt: now,
          reviewSubmittedById: actor.userId,
          reviewDecision: null,
          reviewDecidedAt: null,
          reviewDecidedById: null,
          reviewRejectionReason: null,
        },
      });
      if (moved.count !== 1) throw new ConflictError('O contrato foi alterado por outra operação. Recarregue e tente novamente.');

      const reviewers = await tx.user.findMany({
        where: { officeId: actor.officeId, status: 'ACTIVE', role: { in: REVIEWER_ROLES }, id: { not: actor.userId } },
        select: { id: true },
      });
      for (const reviewer of reviewers) {
        await createNotification(tx, {
          officeId: actor.officeId,
          userId: reviewer.id,
          type: 'INFO',
          title: 'Contrato aguardando revisão',
          description: `O contrato #${contract.number} foi enviado para revisão interna.`,
          priority: true,
          link: `/contratos/${contract.id}`,
        });
      }

      await this.audit(tx, actor, AUDIT_ACTIONS.CONTRACT_SUBMITTED_FOR_REVIEW, contract);
    });

    await this.push(actor.officeId, PUSH_EVENT_TYPES.CONTRACT_REVIEW_SUBMITTED, null, {
      title: 'Contrato aguardando revisão',
      body: `O contrato #${contract.number} foi enviado para revisão interna.`,
      contractId,
    });
  }

  async approve(actor: ReviewActor, contractId: string) {
    this.assertReviewer(actor);
    const contract = await this.loadContract(actor.officeId, contractId);
    if (contract.status !== 'PRONTO_ENVIO') {
      throw new ConflictError('Só é possível aprovar um contrato que está aguardando revisão');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const moved = await tx.contract.updateMany({
        where: { id: contractId, officeId: actor.officeId, status: 'PRONTO_ENVIO' },
        data: {
          status: 'APROVADO',
          reviewDecision: 'APPROVED',
          reviewDecidedAt: now,
          reviewDecidedById: actor.userId,
          reviewRejectionReason: null,
        },
      });
      if (moved.count !== 1) throw new ConflictError('O contrato foi alterado por outra operação. Recarregue e tente novamente.');

      const author = contract.reviewSubmittedById ?? contract.responsibleId;
      if (author !== actor.userId) {
        await createNotification(tx, {
          officeId: actor.officeId,
          userId: author,
          type: 'SUCCESS',
          title: 'Contrato aprovado',
          description: `O contrato #${contract.number} foi aprovado e já pode ser enviado ao cliente.`,
          priority: true,
          link: `/contratos/${contract.id}`,
        });
      }
      await this.audit(tx, actor, AUDIT_ACTIONS.CONTRACT_APPROVED, contract);
    });

    await this.push(actor.officeId, PUSH_EVENT_TYPES.CONTRACT_APPROVED, contract.reviewSubmittedById ?? contract.responsibleId, {
      title: 'Contrato aprovado',
      body: `O contrato #${contract.number} foi aprovado.`,
      contractId,
    });
  }

  async reject(actor: ReviewActor, contractId: string, reason: string) {
    this.assertReviewer(actor);
    const contract = await this.loadContract(actor.officeId, contractId);
    if (contract.status !== 'PRONTO_ENVIO' && contract.status !== 'APROVADO') {
      throw new ConflictError('Só é possível devolver um contrato que está em revisão ou aprovado');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const moved = await tx.contract.updateMany({
        where: { id: contractId, officeId: actor.officeId, status: { in: ['PRONTO_ENVIO', 'APROVADO'] } },
        data: {
          status: 'RASCUNHO',
          reviewDecision: 'REJECTED',
          reviewDecidedAt: now,
          reviewDecidedById: actor.userId,
          reviewRejectionReason: reason,
        },
      });
      if (moved.count !== 1) throw new ConflictError('O contrato foi alterado por outra operação. Recarregue e tente novamente.');

      const author = contract.reviewSubmittedById ?? contract.responsibleId;
      if (author !== actor.userId) {
        await createNotification(tx, {
          officeId: actor.officeId,
          userId: author,
          type: 'WARNING',
          title: 'Contrato devolvido para ajustes',
          description: `O contrato #${contract.number} foi devolvido. Motivo: ${reason}`,
          priority: true,
          link: `/contratos/${contract.id}`,
        });
      }
      // O motivo fica no próprio contrato; o rótulo da auditoria não o repete.
      await this.audit(tx, actor, AUDIT_ACTIONS.CONTRACT_REJECTED, contract);
    });

    await this.push(actor.officeId, PUSH_EVENT_TYPES.CONTRACT_REJECTED, contract.reviewSubmittedById ?? contract.responsibleId, {
      title: 'Contrato devolvido',
      // Push sem o motivo (pode aparecer na tela bloqueada).
      body: `O contrato #${contract.number} foi devolvido para ajustes.`,
      contractId,
    });
  }

  private assertReviewer(actor: ReviewActor): void {
    if (!REVIEWER_ROLES.includes(actor.role)) {
      throw new AuthorizationError('Somente administradores e advogados podem revisar contratos');
    }
  }

  /** Sempre filtrado por officeId: contrato de outro escritório é indistinguível de inexistente (404). */
  private async loadContract(officeId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, officeId },
      select: { id: true, number: true, status: true, responsibleId: true, reviewSubmittedById: true },
    });
    if (!contract) throw new NotFoundError('Contrato não encontrado');
    return contract;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: ReviewActor,
    action: string,
    contract: { id: string; number: number },
  ) {
    return writeAuditLog(tx, {
      officeId: actor.officeId,
      actorId: actor.userId,
      action,
      entityType: 'Contract',
      entityId: contract.id,
      entityLabel: `Contrato #${contract.number}`,
    });
  }

  private async push(
    officeId: string,
    pushEvent: 'CONTRACT_REVIEW_SUBMITTED' | 'CONTRACT_APPROVED' | 'CONTRACT_REJECTED',
    responsibleId: string | null,
    message: { title: string; body: string; contractId: string },
  ) {
    await this.dispatcher?.dispatch({
      officeId,
      pushEvent,
      responsibleId,
      push: { type: pushEvent, title: message.title, body: message.body, url: `/contratos/${message.contractId}`, tag: `review:${message.contractId}` },
    });
  }
}
