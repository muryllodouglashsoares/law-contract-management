import { Prisma } from '@prisma/client';
import type {
  Client,
  Contract,
  ContractStatus,
  ContractTemplate,
  ContractVersion,
  PrismaClient,
  User,
  UserRole,
} from '@prisma/client';

import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { createNotification } from '../../shared/domain/notify';
import { buildContractTemplateVariables, renderTemplate } from '../../shared/domain/render-template';
import {
  CONTRACT_STATUS_FROM_API,
  CONTRACT_STATUS_TO_API,
  RENEWAL_ALERT_CONTRACT_STATUSES,
  contractStatusTransitionsFrom,
  isTransitionBlockedForGenericStatusUpdate,
} from '../../shared/domain/status-map';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { formatDateBR } from '../../shared/utils/dates';
import { applyPercentAdjustment } from '../../shared/utils/money';
import { generateContractPdf } from '../../shared/pdf/contract-pdf';
import { getStorage, removeQuietly, type StorageDriver } from '../../shared/storage';
import { keyBelongsToOffice } from '../../shared/storage/storage-key';
import { sha256Hex } from '../../shared/utils/hash';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { ContractWithRelations } from '../../shared/utils/serialize-contract';
import {
  END_BEFORE_START_MESSAGE,
  type CreateContractBody,
  type ListContractsQuery,
  type UpdateContractBody,
} from './contract.schemas';

const CONTRACT_INCLUDE = {
  client: { select: { id: true, name: true, document: true, email: true, phone: true } },
  template: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
  reviewSubmittedBy: { select: { id: true, name: true } },
  reviewDecidedBy: { select: { id: true, name: true } },
  versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
};

/** Campos que, ao mudar, exigem gerar uma nova ContractVersion (o texto do
 * contrato depende deles). `conditions` também entra: é anexado ao final
 * do texto renderizado do template. `endDate` também: alimenta a variável
 * {{contrato.data_fim}} (templates antigos que não a usam não mudam de texto,
 * mas a nova versão mantém o histórico consistente com os dados do contrato). */
const CONTENT_AFFECTING_FIELDS = [
  'clientId',
  'templateId',
  'value',
  'object',
  'startDate',
  'endDate',
  'termText',
  'conditions',
] as const;

export interface ContractActor {
  userId: string;
  officeId: string;
  /** Papel da sessão. Quando ASSISTANT, só pode editar contratos de que é responsável. */
  role?: UserRole;
}

type PrismaDeps = Pick<
  PrismaClient,
  'contract' | 'client' | 'contractTemplate' | 'contractVersion' | 'document' | 'user' | 'office' | 'notification' | 'auditLog' | '$transaction'
>;

export class ContractService {
  constructor(
    private readonly prisma: PrismaDeps,
    private readonly storage: StorageDriver = getStorage(),
  ) {}

  async list(officeId: string, query: ListContractsQuery): Promise<Paginated<ContractWithRelations>> {
    const where: Prisma.ContractWhereInput = {
      officeId,
      ...(query.status ? { status: CONTRACT_STATUS_FROM_API(query.status) } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.startDateFrom || query.startDateTo
        ? {
            startDate: {
              ...(query.startDateFrom ? { gte: query.startDateFrom } : {}),
              ...(query.startDateTo ? { lte: query.startDateTo } : {}),
            },
          }
        : {}),
      // Contratos sem endDate nunca casam com um filtro de período de término.
      ...(query.endDateFrom || query.endDateTo
        ? {
            endDate: {
              ...(query.endDateFrom ? { gte: query.endDateFrom } : {}),
              ...(query.endDateTo ? { lte: query.endDateTo } : {}),
            },
          }
        : {}),
      ...(query.valueMin !== undefined || query.valueMax !== undefined
        ? {
            value: {
              ...(query.valueMin !== undefined ? { gte: query.valueMin } : {}),
              ...(query.valueMax !== undefined ? { lte: query.valueMax } : {}),
            },
          }
        : {}),
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
          endDate: data.endDate,
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
    if (actor.role === 'ASSISTANT' && existing.responsible.id !== actor.userId) {
      throw new AuthorizationError('Você só pode editar os contratos pelos quais é responsável');
    }

    // Regra de negócio no backend (nunca só no frontend): término >= início, considerando
    // o valor persistido quando apenas um dos dois campos é enviado.
    const effectiveStart = data.startDate ?? existing.startDate;
    const effectiveEnd = data.endDate === undefined ? existing.endDate : data.endDate;
    if (effectiveEnd && effectiveEnd.getTime() < effectiveStart.getTime()) {
      throw new ValidationError('Dados inválidos no corpo da requisição', [
        { path: 'endDate', message: END_BEFORE_START_MESSAGE },
      ]);
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
          ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
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

    const office = await this.prisma.office.findUnique({
      where: { id: actor.officeId },
      select: { requireInternalApproval: true },
    });
    const guard = isTransitionBlockedForGenericStatusUpdate(
      existing.status as ContractStatus,
      target,
      office?.requireInternalApproval ?? false,
    );
    if (guard.blocked) {
      throw new ConflictError(guard.reason ?? 'Transição não permitida');
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
   * Renovação em um clique (ADMIN/LAWYER — garantido na rota).
   *
   * Regra jurídica segura: renovar muda dados que fazem parte do texto contratual (data de término
   * e, com reajuste, o valor). Por isso a renovação NUNCA edita a versão assinada: ela cria uma NOVA
   * ContractVersion (com `changeNote`), mantendo intactas a versão aceita, seu hash e o PDF assinado.
   * O status do contrato não muda (continua ATIVO/ASSINADO), e o ciclo de alertas de renovação é
   * reiniciado (renewalAlertSentAt/ForEndDate = null) na MESMA transação.
   */
  async renew(
    actor: ContractActor,
    id: string,
    input: { newEndDate: Date; adjustmentPercent?: number },
  ): Promise<ContractWithRelations> {
    const existing = await this.getById(actor.officeId, id);

    if (!RENEWAL_ALERT_CONTRACT_STATUSES.includes(existing.status)) {
      throw new ConflictError('Só é possível renovar contratos ativos ou assinados');
    }

    const baseline = existing.endDate ?? existing.startDate;
    if (input.newEndDate.getTime() <= baseline.getTime()) {
      throw new ValidationError('Dados inválidos no corpo da requisição', [
        {
          path: 'newEndDate',
          message: existing.endDate
            ? 'A nova data de término deve ser posterior à data de término atual'
            : 'A nova data de término deve ser posterior à data de início',
        },
      ]);
    }

    const newValue =
      input.adjustmentPercent !== undefined ? applyPercentAdjustment(existing.value, input.adjustmentPercent) : existing.value;
    const note =
      `Renovação até ${formatDateBR(input.newEndDate)}` +
      (input.adjustmentPercent !== undefined ? ` com reajuste de ${input.adjustmentPercent}%` : '');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Condicional: se o contrato mudou de status/endDate depois da leitura, nada é gravado.
      const claimed = await tx.contract.updateMany({
        where: { id, officeId: actor.officeId, status: { in: RENEWAL_ALERT_CONTRACT_STATUSES }, endDate: existing.endDate },
        data: {
          endDate: input.newEndDate,
          value: newValue,
          // Reinicia o ciclo de alertas de renovação (obrigatório).
          renewalAlertSentAt: null,
          renewalAlertForEndDate: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError('O contrato foi alterado por outra operação. Recarregue e tente novamente.');
      }

      const [contract, lawyer, office, lastVersion] = await Promise.all([
        tx.contract.findUniqueOrThrow({ where: { id }, include: { client: true, template: true } }),
        tx.user.findUniqueOrThrow({ where: { id: existing.responsible.id } }),
        tx.office.findUniqueOrThrow({ where: { id: actor.officeId } }),
        tx.contractVersion.findFirst({ where: { contractId: id }, orderBy: { versionNumber: 'desc' } }),
      ]);

      await tx.contractVersion.create({
        data: {
          contractId: id,
          versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
          content: this.renderContractContent(contract.template, contract.client, contract, lawyer, office),
          authorId: actor.userId,
          changeNote: note,
        },
      });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.CONTRACT_RENEWED,
        entityType: 'Contract',
        entityId: id,
        // Sem valores financeiros no rótulo.
        entityLabel: `Contrato #${contract.number} (até ${formatDateBR(input.newEndDate)})`,
      });
    });

    return this.getById(actor.officeId, id);
  }

  /**
   * Gera (sob demanda) o PDF de uma ContractVersion, guarda-o no storage e o
   * registra como Document. O conteúdo vem SEMPRE de ContractVersion.content
   * (fonte de verdade no banco) — nada vindo do frontend entra no PDF.
   *
   * Fluxo: ContractVersion → PDFKit → Buffer → SHA-256 → storage → Document(contentHash).
   * O hash é calculado sobre o MESMO Buffer que vai para o storage (sem cópia extra).
   *
   * Idempotente: `Document.contractVersionId` é único, então cada versão tem no
   * máximo um PDF; chamadas repetidas/concorrentes devolvem o mesmo documento.
   * Como o PDF é determinístico (mesma versão → mesmos bytes), se o objeto sumir do
   * storage (ex.: disco efêmero antigo) ele é regenerado na mesma chave, sem novo Document.
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
      await this.restoreMissingPdf(actor, contract, version, existing);
      return { documentId: existing.id, created: false };
    }

    const pdf = await this.renderPdf(actor.officeId, contract, version);

    // O storage não participa da transação do banco: grava primeiro e, se o registro falhar, remove o objeto.
    const stored = await this.storage.save({
      officeId: actor.officeId,
      fileName: pdf.fileName,
      contentType: pdf.mimeType,
      body: pdf.buffer,
    });

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
            sizeBytes: stored.sizeBytes,
            category: 'CONTRATO',
            storagePath: stored.key,
            contentHash: pdf.contentHash,
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
      // O objeto já estava no storage: não deixamos órfão se o registro falhar.
      await removeQuietly(this.storage, stored.key, 'contract.generatePdf');

      // Outra requisição gerou o PDF desta versão primeiro (unique em contractVersionId).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.document.findUnique({ where: { contractVersionId: version.id } });
        if (winner) return { documentId: winner.id, created: false };
      }
      throw error;
    }
  }

  private async renderPdf(
    officeId: string,
    contract: Pick<Contract, 'number'>,
    version: Pick<ContractVersion, 'versionNumber' | 'content' | 'createdAt'>,
  ) {
    const office = await this.prisma.office.findUniqueOrThrow({ where: { id: officeId } });
    const pdf = await generateContractPdf({
      contract: { number: contract.number },
      version: { versionNumber: version.versionNumber, content: version.content, createdAt: version.createdAt },
      office,
    });
    return { ...pdf, contentHash: sha256Hex(pdf.buffer) };
  }

  /**
   * Um Document de PDF cujo objeto não existe mais no storage é regenerado a partir da
   * ContractVersion, na mesma chave. Falha de verificação nunca derruba a requisição.
   */
  private async restoreMissingPdf(
    actor: ContractActor,
    contract: Pick<Contract, 'number'>,
    version: Pick<ContractVersion, 'versionNumber' | 'content' | 'createdAt'>,
    document: { id: string; storagePath: string; contentHash: string | null; sizeBytes: number; mimeType: string },
  ): Promise<void> {
    if (!keyBelongsToOffice(document.storagePath, actor.officeId)) return;

    try {
      if (await this.storage.exists(document.storagePath)) return;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ level: 'error', msg: 'Não foi possível verificar o PDF no storage', documentId: document.id, err: String(error) }));
      return;
    }

    const pdf = await this.renderPdf(actor.officeId, contract, version);
    await this.storage.save({
      officeId: actor.officeId,
      fileName: 'restore.pdf',
      contentType: pdf.mimeType,
      body: pdf.buffer,
      key: document.storagePath,
    });

    if (pdf.contentHash !== document.contentHash || pdf.buffer.byteLength !== document.sizeBytes) {
      // Mesmo conteúdo lógico, bytes diferentes (ex.: PDFKit atualizado): o hash passa a refletir o arquivo atual.
      await this.prisma.document.update({
        where: { id: document.id },
        data: { contentHash: pdf.contentHash, sizeBytes: pdf.buffer.byteLength },
      });
    }
  }

  private renderContractContent(
    template: Pick<ContractTemplate, 'content'>,
    client: Pick<Client, 'name' | 'document' | 'email' | 'phone' | 'address'>,
    contract: Pick<Contract, 'value' | 'startDate' | 'endDate' | 'termText' | 'object' | 'number' | 'conditions'>,
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
        endDate: contract.endDate,
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
