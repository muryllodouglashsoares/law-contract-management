import { Prisma, type PrismaClient, type User, type UserRole, type UserStatus } from '@prisma/client';

import { comparePassword, hashPassword } from '../../shared/auth/password';
import { generateTemporaryPassword } from '../../shared/auth/temporary-password';
import { AUDIT_ACTIONS, writeAuditLog } from '../../shared/domain/audit';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { paginationSkipTake, toPaginated, type Paginated, type PaginationQuery } from '../../shared/http/pagination';
import type { ChangePasswordBody, CreateUserBody, ListUsersQuery, UpdateMeBody } from './user.schemas';

export interface UserActor {
  userId: string;
  officeId: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  LAWYER: 'Advogado(a)',
  ASSISTANT: 'Assistente',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
};

export class UserService {
  constructor(private readonly prisma: Pick<PrismaClient, 'user' | 'auditLog' | '$transaction'>) {}

  async getById(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    return user;
  }

  async updateMe(userId: string, data: UpdateMeBody): Promise<User> {
    // Garante que o usuário existe antes de tentar atualizar,
    // retornando um 404 claro em vez do erro genérico do Prisma.
    await this.getById(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /** Exige a senha atual correta antes de gravar a nova — nunca confie
   * apenas em o usuário estar autenticado para trocar a própria senha.
   * A senha e o flag `mustChangePassword` são gravados no mesmo UPDATE (atômico). */
  async changePassword(userId: string, data: ChangePasswordBody): Promise<void> {
    const user = await this.getById(userId);

    const isCurrentPasswordValid = await comparePassword(data.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      // 400 (e não 401): a sessão é válida. Um 401 faria o frontend deslogar o usuário
      // (api-client) por um simples erro de digitação — inclusive na troca obrigatória de senha.
      throw new ValidationError('Senha atual incorreta', [{ path: 'currentPassword', message: 'Senha atual incorreta' }]);
    }

    const passwordHash = await hashPassword(data.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  // -------------------------------------------------------------------
  // Gestão de usuários (somente ADMIN — garantido em user.routes.ts).
  // Todo acesso é escopado pelo officeId da SESSÃO; usuário de outro
  // escritório é indistinguível de um inexistente (404).
  // -------------------------------------------------------------------

  async list(officeId: string, query: ListUsersQuery): Promise<Paginated<User>> {
    const where: Prisma.UserWhereInput = {
      officeId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, ...paginationSkipTake(query) }),
      this.prisma.user.count({ where }),
    ]);

    return toPaginated(data, total, query as PaginationQuery);
  }

  async getInOffice(officeId: string, id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, officeId } });

    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    return user;
  }

  /** Cria o usuário com uma senha provisória aleatória. O texto da senha só existe
   * em memória e é devolvido UMA vez ao chamador; no banco fica apenas o hash, e
   * ela nunca vai para log nem para a auditoria. */
  async create(actor: UserActor, data: CreateUserBody): Promise<{ user: User; temporaryPassword: string }> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: data.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('Já existe um usuário cadastrado com este e-mail');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.user.create({
          data: {
            officeId: actor.officeId,
            name: data.name,
            email: data.email,
            role: data.role,
            phone: data.phone,
            oabNumber: data.oabNumber,
            passwordHash,
            mustChangePassword: true,
          },
        });

        await writeAuditLog(tx, {
          officeId: actor.officeId,
          actorId: actor.userId,
          action: AUDIT_ACTIONS.USER_CREATED,
          entityType: 'User',
          entityId: created.id,
          entityLabel: `${created.name} (${ROLE_LABELS[created.role]})`,
        });

        return created;
      });

      return { user, temporaryPassword };
    } catch (error) {
      // Corrida entre o pré-check acima e o INSERT: o índice único do banco é a garantia final.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Já existe um usuário cadastrado com este e-mail');
      }
      throw error;
    }
  }

  async updateRole(actor: UserActor, id: string, role: UserRole): Promise<User> {
    if (id === actor.userId) {
      throw new AuthorizationError('Você não pode alterar o seu próprio papel');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.lockOfficeAdmins(tx, actor.officeId);

      const target = await tx.user.findFirst({ where: { id, officeId: actor.officeId } });
      if (!target) {
        throw new NotFoundError('Usuário não encontrado');
      }

      if (target.role === role) {
        return target;
      }

      if (target.role === 'ADMIN' && target.status === 'ACTIVE') {
        await this.assertNotLastActiveAdmin(tx, actor.officeId, 'Não é possível remover o último administrador ativo do escritório');
      }

      const updated = await tx.user.update({ where: { id: target.id }, data: { role } });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        entityType: 'User',
        entityId: updated.id,
        entityLabel: `${updated.name} para ${ROLE_LABELS[role]}`,
      });

      return updated;
    });
  }

  async updateStatus(actor: UserActor, id: string, status: UserStatus): Promise<User> {
    if (id === actor.userId) {
      throw new AuthorizationError('Você não pode alterar o seu próprio status');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.lockOfficeAdmins(tx, actor.officeId);

      const target = await tx.user.findFirst({ where: { id, officeId: actor.officeId } });
      if (!target) {
        throw new NotFoundError('Usuário não encontrado');
      }

      if (target.status === status) {
        return target;
      }

      if (status === 'INACTIVE' && target.role === 'ADMIN' && target.status === 'ACTIVE') {
        await this.assertNotLastActiveAdmin(tx, actor.officeId, 'Não é possível desativar o último administrador ativo do escritório');
      }

      // Nunca há DELETE: contratos, versões e auditoria continuam referenciando o usuário.
      const updated = await tx.user.update({ where: { id: target.id }, data: { status } });

      await writeAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.userId,
        action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
        entityType: 'User',
        entityId: updated.id,
        entityLabel: `${updated.name} para ${STATUS_LABELS[status]}`,
      });

      return updated;
    });
  }

  /** Serializa alterações de papel/status dentro do escritório (lock de linha no Office).
   * Sem isso, dois ADMINs se rebaixando/desativando ao mesmo tempo poderiam ambos ver
   * "existe outro ADMIN ativo" e deixar o escritório sem nenhum. */
  private async lockOfficeAdmins(tx: Prisma.TransactionClient, officeId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "offices" WHERE "id" = ${officeId} FOR UPDATE`;
  }

  private async assertNotLastActiveAdmin(
    tx: Prisma.TransactionClient,
    officeId: string,
    message: string,
  ): Promise<void> {
    const activeAdmins = await tx.user.count({ where: { officeId, role: 'ADMIN', status: 'ACTIVE' } });
    if (activeAdmins <= 1) {
      throw new ConflictError(message);
    }
  }
}
