import type { Client, Prisma, PrismaClient } from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { CLIENT_STATUS_FROM_API } from '../../shared/domain/status-map';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { ClientWithComputed } from '../../shared/utils/serialize-client';
import type { CreateClientBody, ListClientsQuery, UpdateClientBody } from './client.schemas';

/** Include padrão para retornar os campos computados (ver serialize-client.ts). */
const CLIENT_INCLUDE = {
  _count: { select: { contracts: true } },
  contracts: { orderBy: { updatedAt: 'desc' as const }, take: 1, select: { updatedAt: true } },
};

export interface ClientActor {
  userId: string;
  officeId: string;
}

export class ClientService {
  constructor(private readonly prisma: Pick<PrismaClient, 'client' | 'auditLog' | '$transaction'>) {}

  async list(officeId: string, query: ListClientsQuery): Promise<Paginated<ClientWithComputed>> {
    const where: Prisma.ClientWhereInput = {
      officeId,
      ...(query.status ? { status: CLIENT_STATUS_FROM_API(query.status) } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { document: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        include: CLIENT_INCLUDE,
        orderBy: { name: 'asc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.client.count({ where }),
    ]);

    return toPaginated(data as ClientWithComputed[], total, query as PaginationQuery);
  }

  async getById(officeId: string, id: string): Promise<ClientWithComputed> {
    const client = await this.prisma.client.findFirst({
      where: { id, officeId },
      include: CLIENT_INCLUDE,
    });

    if (!client) {
      throw new NotFoundError('Cliente não encontrado');
    }

    return client as ClientWithComputed;
  }

  async create(actor: ClientActor, data: CreateClientBody): Promise<ClientWithComputed> {
    await this.assertDocumentAvailable(actor.officeId, data.document);

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const client = await tx.client.create({
        data: { ...data, officeId: actor.officeId },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.CREATED,
        entityType: 'Client',
        entityId: client.id,
        entityLabel: `Cliente ${client.name}`,
      });

      return client;
    });

    return this.getById(actor.officeId, created.id);
  }

  async update(actor: ClientActor, id: string, data: UpdateClientBody): Promise<ClientWithComputed> {
    const existing = await this.getById(actor.officeId, id);

    if (data.document && data.document !== existing.document) {
      await this.assertDocumentAvailable(actor.officeId, data.document);
    }

    const { status, ...rest } = data;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const client = await tx.client.update({
        where: { id },
        data: { ...rest, ...(status ? { status: CLIENT_STATUS_FROM_API(status) } : {}) },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.UPDATED,
        entityType: 'Client',
        entityId: client.id,
        entityLabel: `Cliente ${client.name}`,
      });
    });

    return this.getById(actor.officeId, id);
  }

  async remove(actor: ClientActor, id: string): Promise<void> {
    const client = await this.getById(actor.officeId, id);

    // client.service.ts linha 120
  if (client._count.contracts > 0) {
      throw new ConflictError('Não é possível remover um cliente com contratos vinculados. Inative-o em vez disso.');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.client.delete({ where: { id } });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.DELETED,
        entityType: 'Client',
        entityId: id,
        entityLabel: `Cliente ${client.name}`,
      });
    });
  }

  private async assertDocumentAvailable(officeId: string, document: string): Promise<void> {
    const existing: Pick<Client, 'id'> | null = await this.prisma.client.findFirst({
      where: { officeId, document },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError('Já existe um cliente cadastrado com este CPF/CNPJ');
    }
  }
}
