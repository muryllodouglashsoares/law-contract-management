import type { Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { TEMPLATE_STATUS_FROM_API } from '../../shared/domain/status-map';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { ContractTemplateWithComputed } from '../../shared/utils/serialize-contract-template';
import type {
  CreateContractTemplateBody,
  ListContractTemplatesQuery,
  UpdateContractTemplateBody,
} from './contract-template.schemas';

const TEMPLATE_INCLUDE = { _count: { select: { contracts: true } } };

export interface ContractTemplateActor {
  userId: string;
  officeId: string;
}

export class ContractTemplateService {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'contractTemplate' | 'auditLog' | '$transaction'>,
  ) {}

  async list(
    officeId: string,
    query: ListContractTemplatesQuery,
  ): Promise<Paginated<ContractTemplateWithComputed>> {
    const where: Prisma.ContractTemplateWhereInput = {
      officeId,
      ...(query.status ? { status: TEMPLATE_STATUS_FROM_API(query.status) } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.contractTemplate.findMany({
        where,
        include: TEMPLATE_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.contractTemplate.count({ where }),
    ]);

    return toPaginated(data as ContractTemplateWithComputed[], total, query as PaginationQuery);
  }

  async getById(officeId: string, id: string): Promise<ContractTemplateWithComputed> {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id, officeId },
      include: TEMPLATE_INCLUDE,
    });

    if (!template) {
      throw new NotFoundError('Modelo de contrato não encontrado');
    }

    return template as ContractTemplateWithComputed;
  }

  async create(
    actor: ContractTemplateActor,
    data: CreateContractTemplateBody,
  ): Promise<ContractTemplateWithComputed> {
    const { status, ...rest } = data;

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const template = await tx.contractTemplate.create({
        data: { ...rest, officeId: actor.officeId, ...(status ? { status: TEMPLATE_STATUS_FROM_API(status) } : {}) },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.CREATED,
        entityType: 'ContractTemplate',
        entityId: template.id,
        entityLabel: `Modelo ${template.name}`,
      });

      return template;
    });

    return this.getById(actor.officeId, created.id);
  }

  async update(
    actor: ContractTemplateActor,
    id: string,
    data: UpdateContractTemplateBody,
  ): Promise<ContractTemplateWithComputed> {
    await this.getById(actor.officeId, id);
    const { status, ...rest } = data;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const template = await tx.contractTemplate.update({
        where: { id },
        data: { ...rest, ...(status ? { status: TEMPLATE_STATUS_FROM_API(status) } : {}) },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.UPDATED,
        entityType: 'ContractTemplate',
        entityId: template.id,
        entityLabel: `Modelo ${template.name}`,
      });
    });

    return this.getById(actor.officeId, id);
  }

  async remove(actor: ContractTemplateActor, id: string): Promise<void> {
    const template = await this.getById(actor.officeId, id);

// contract-template.service.ts linha 118
  if (template._count.contracts > 0) {
    throw new ConflictError(
        'Não é possível remover um modelo já utilizado em contratos. Marque-o como rascunho em vez disso.',
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.contractTemplate.delete({ where: { id } });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.DELETED,
        entityType: 'ContractTemplate',
        entityId: id,
        entityLabel: `Modelo ${template.name}`,
      });
    });
  }
}
