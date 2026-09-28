import { Prisma } from '@prisma/client';
import type {
  Client,
  Contract,
  ContractStatus,
  ContractTemplate,
  ContractVersion,
  PrismaClient,
  User,
} from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { buildContractTemplateVariables, renderTemplate } from '../../shared/domain/render-template';
import {
  CONTRACT_STATUS_FROM_API,
  CONTRACT_STATUS_TO_API,
  contractStatusTransitionsFrom,
} from '../../shared/domain/status-map';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { generateContractPdf } from '../../shared/pdf/contract-pdf';
import { removeFile, saveFile } from '../../shared/storage/local-file-storage';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { ContractWithRelations } from '../../shared/utils/serialize-contract';
import type {
  CreateContractBody,
  ListContractsQuery,
  UpdateContractBody,
} from './contract.schemas';

const CONTRACT_INCLUDE = {
  client: { select: { id: true, name: true, document: true, email: true } },
  template: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
  versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
};

/** Campos que, ao mudar, exigem gerar uma nova ContractVersion (o texto do
 * contrato depende deles). `conditions` também entra: é anexado ao final
 * do texto renderizado do template. */
const CONTENT_AFFECTING_FIELDS = [
  'clientId',
  'templateId',
  'value',
  'object',
  'startDate',
  'termText',
  'conditions',
] as const;

export interface ContractActor {
  userId: string;
  officeId: string;
}

type PrismaDeps = Pick<
  PrismaClient,
  'contract' | 'client' | 'contractTemplate' | 'contractVersion' | 'document' | 'user' | 'office' | 'notification' | 'auditLog' | '$transaction'
>;

export class ContractService {
  constructor(private readonly prisma: PrismaDeps) {}

  async list(officeId: string, query: ListContractsQuery): Promise<Paginated<ContractWithRelations>> {
    const where: Prisma.ContractWhereInput = {
      officeId,
      ...(query.status ? { status: CONTRACT_STATUS_FROM_API(query.status) } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { object: { contains: query.search, mode: 'insensitive' } },
              { client: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: CONTRACT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.contract.count({ where }),
    ]);

    return toPaginated(data as ContractWithRelations[], total, query as PaginationQuery);
  }

  async getById(officeId: string, id: string): Promise<ContractWithRelations> {
    const contract = await this.prisma.contract.findFirst({
      where: { id, officeId },
      include: CONTRACT_INCLUDE,
    });

    if (!contract) {
      throw new NotFoundError('Contrato não encontrado');
    }

    return contract as ContractWithRelations;
  }

  async listVersions(
    officeId: string,
    id: string,
  ): Promise<(ContractVersion & { author: { id: string; name: string } })[]> {
    await this.getById(officeId, id); // garante existência + isolamento por office
    return this.prisma.contractVersion.findMany({
      where: { contractId: id },
      orderBy: { versionNumber: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async create(actor: ContractActor, data: CreateContractBody): Promise<ContractWithRelations> {
    const [client, template, lawyer, office] = await Promise.all([
      this.getClientOrThrow(actor.officeId, data.clientId),
      this.getTemplateOrThrow(actor.officeId, data.templateId),
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } }),
      this.prisma.office.findUniqueOrThrow({ where: { id: actor.officeId } }),
    ]);

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const contract = await tx.contract.create({
        data: {
          officeId: actor.officeId,
          clientId: client.id,
          templateId: template.id,
          responsibleId: actor.userId,
          value: data.value,
          object: data.object,
          startDate: data.startDate,
          termText: data.termText,
          conditions: data.conditions,
        },
      });

      const content = this.renderContractContent(template, client, contract, lawyer, office);
      await tx.contractVersion.create({
        data: { contractId: contract.id, versionNumber: 1, content, authorId: actor.userId },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.CREATED,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: `Contrato #${contract.number}`,
      });

      return contract;
    });

    return this.getById(actor.officeId, created.id);
  }

  async update(actor: ContractActor, id: string, data: UpdateContractBody): Promise<ContractWithRelations> {
    const existing = await this.getById(actor.officeId, id);

    if (existing.status !== 'RASCUNHO') {
      throw new ConflictError('Só é possível editar um contrato enquanto ele está em rascunho');
    }

    const [client, template] = await Promise.all([
      data.clientId ? this.getClientOrThrow(actor.officeId, data.clientId) : Promise.resolve(null),
      data.templateId ? this.getTemplateOrThrow(actor.officeId, data.templateId) : Promise.resolve(null),
    ]);

    const contentChanged = CONTENT_AFFECTING_FIELDS.some((field) => field in data);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const contract = await tx.contract.update({
        where: { id },
        data: {
          ...(client ? { clientId: client.id } : {}),
          ...(template ? { templateId: template.id } : {}),
          ...(data.value !== undefined ? { value: data.value } : {}),
          ...(data.object !== undefined ? { object: data.object } : {}),
          ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
          ...(data.termText !== undefined ? { termText: data.termText } : {}),
          ...(data.conditions !== undefined ? { conditions: data.conditions } : {}),
        },
        include: { client: true, template: true },
      });

      if (contentChanged) {
        const [lawyer, office, lastVersion] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: contract.responsibleId } }),
          tx.office.findUniqueOrThrow({ where: { id: actor.officeId } }),
          tx.contractVersion.findFirst({ where: { contractId: id }, orderBy: { versionNumber: 'desc' } }),
        ]);

        const content = this.renderContractContent(contract.template, contract.client, contract, lawyer, office);

        await tx.contractVersion.create({
          data: {
            contractId: id,
            versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
            content,
            authorId: actor.userId,
          },
        });
      }

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.UPDATED,
        entityType: 'Contract',
        entityId: id,
        entityLabel: `Contrato #${contract.number}`,
      });
    });

    return this.getById(actor.officeId, id);
  }

  async updateStatus(actor: ContractActor, id: string, statusApi: string): Promise<ContractWithRelations> {
    const existing = await this.getById(actor.officeId, id);
    const target = CONTRACT_STATUS_FROM_API(statusApi);

    if (existing.status === target) {
      return existing;
    }

    const allowedTransitions = contractStatusTransitionsFrom(existing.status as ContractStatus);
    if (!allowedTransitions.includes(target)) {
      throw new ConflictError(
        `Não é possível mover o contrato de "${CONTRACT_STATUS_TO_API(existing.status as ContractStatus)}" para "${statusApi}"`,
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const contract = await tx.contract.update({ where: { id }, data: { status: target } });

      const action =
        target === 'ENVIADO' ? AUDIT_ACTIONS.SENT : target === 'ASSINADO' ? AUDIT_ACTIONS.SIGNED : AUDIT_ACTIONS.STATUS_CHANGED;

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action,
        entityType: 'Contract',
        entityId: id,
        entityLabel: `Contrato #${contract.number}`,
      });

      if (target === 'ENVIADO' || target === 'ASSINADO' || target === 'ATIVO') {
        const titles: Partial<Record<ContractStatus, string>> = {
          ENVIADO: 'Contrato enviado',
          ASSINADO: 'Contrato assinado',
          ATIVO: 'Contrato ativo',
        };

        await createNotification(tx, {
          officeId: actor.officeId,
          userId: existing.responsible.id,
          type: 'INFO',
          title: titles[target] ?? 'Contrato atualizado',
          description: `O contrato #${contract.number} de ${existing.client.name} agora está "${CONTRACT_STATUS_TO_API(target)}".`,
        });
      }
    });

    return this.getById(actor.officeId, id);
  }

  /**
   * Materializa uma ContractVersion como PDF imutável, salvo pelo storage e
   * registrado como Document. O conteúdo vem SEMPRE de ContractVersion.content
   * (fonte de verdade no banco) — nada vindo do frontend entra no PDF.
   *
   * Idempotente: `Document.contractVersionId` é único, então cada versão tem
   * no máximo um PDF. Chamadas repetidas/concorrentes devolvem o mesmo documento.
   */
  async generatePdf(
    actor: ContractActor,
    contractId: string,
    options: { versionNumber?: number } = {},
  ): Promise<{ documentId: string; created: boolean }> {
    // 404 se o contrato não existir OU for de outro escritório.
    const contract = await this.getById(actor.officeId, contractId);

    // A busca por (contractId, versionNumber) impede usar versão de outro contrato.
    const version =
      options.versionNumber === undefined
        ? contract.versions[0]
        : await this.prisma.contractVersion.findFirst({
            where: { contractId: contract.id, versionNumber: options.versionNumber },
          });
    if (!version) {
      throw new NotFoundError('Versão do contrato não encontrada');
    }

    const existing = await this.prisma.document.findUnique({ where: { contractVersionId: version.id } });
    if (existing) {
      return { documentId: existing.id, created: false };
    }

    const office = await this.prisma.office.findUniqueOrThrow({ where: { id: actor.officeId } });
    const pdf = await generateContractPdf({
      contract: { number: contract.number },
      version: { versionNumber: version.versionNumber, content: version.content, createdAt: version.createdAt },
      office,
    });
    const saved = await saveFile(actor.officeId, pdf.fileName, pdf.buffer);

    try {
      const document = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.document.create({
          data: {
            officeId: actor.officeId,
            contractId: contract.id,
            contractVersionId: version.id,
            uploadedById: actor.userId,
            fileName: pdf.fileName,
            fileType: 'PDF',
            mimeType: pdf.mimeType,
            sizeBytes: saved.sizeBytes,
            category: 'CONTRATO',
            storagePath: saved.storagePath,
          },
        });

        await writeAuditLog(tx, {
          officeId: actor.officeId,
          actorId: actor.userId,
          action: AUDIT_ACTIONS.CONTRACT_PDF_GENERATED,
          entityType: 'Contract',
          entityId: contract.id,
          entityLabel: `Contrato #${contract.number}`,
        });

        return created;
      });

      return { documentId: document.id, created: true };
    } catch (error) {
      // O arquivo já estava no disco: não deixamos órfão se o registro falhar.
      await removeFile(saved.storagePath);

      // Outra requisição gerou o PDF desta versão primeiro (unique em contractVersionId).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.document.findUnique({ where: { contractVersionId: version.id } });
        if (winner) return { documentId: winner.id, created: false };
      }
      throw error;
    }
  }

  private renderContractContent(
    template: Pick<ContractTemplate, 'content'>,
    client: Pick<Client, 'name' | 'document' | 'email' | 'phone' | 'address'>,
    contract: Pick<Contract, 'value' | 'startDate' | 'termText' | 'object' | 'number' | 'conditions'>,
    lawyer: Pick<User, 'name' | 'email' | 'oabNumber'>,
    office: { name: string },
  ): string {
    const variables = buildContractTemplateVariables({
      client: {
        name: client.name,
        document: client.document,
        email: client.email,
        phone: client.phone,
        address: client.address,
      },
      contract: {
        object: contract.object,
        value: typeof contract.value === 'number' ? contract.value : Number(contract.value),
        startDate: contract.startDate,
        termText: contract.termText,
        number: contract.number,
      },
      lawyer: { name: lawyer.name, email: lawyer.email, oabNumber: lawyer.oabNumber },
      office,
    });

    const rendered = renderTemplate(template.content, variables);
    return contract.conditions ? `${rendered}\n\nCondições adicionais:\n${contract.conditions}` : rendered;
  }

  private async getClientOrThrow(officeId: string, clientId: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, officeId } });
    if (!client) throw new NotFoundError('Cliente não encontrado');
    return client;
  }

  private async getTemplateOrThrow(officeId: string, templateId: string): Promise<ContractTemplate> {
    const template = await this.prisma.contractTemplate.findFirst({ where: { id: templateId, officeId } });
    if (!template) throw new NotFoundError('Modelo de contrato não encontrado');
    return template;
  }
}
