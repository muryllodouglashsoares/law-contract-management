import type { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';

export interface FakeUser {
  id: string;
  officeId: string;
  role: 'ADMIN' | 'LAWYER' | 'ASSISTANT';
  status: 'ACTIVE' | 'INACTIVE';
}

type WhereClause = {
  officeId?: string;
  status?: string;
  OR?: ({ id?: { in: string[] } } | { role?: { in: string[] } })[];
};

/**
 * `prisma.user.findMany` falso que interpreta APENAS o formato de `where` usado pela política
 * (officeId, status e OR de id/role). Assim os testes validam a consulta E a lógica, sem banco.
 * Com `ignoreWhere`, devolve todos os usuários: prova que o filtro em memória é uma defesa real.
 */
export function makeFakeUserDb(users: FakeUser[], opts: { ignoreWhere?: boolean } = {}) {
  const findMany = vi.fn(async ({ where }: { where: WhereClause }) => {
    if (opts.ignoreWhere) return users;
    return users.filter((user) => {
      if (where.officeId !== undefined && user.officeId !== where.officeId) return false;
      if (where.status !== undefined && user.status !== where.status) return false;
      if (where.OR) {
        return where.OR.some((clause) => {
          if ('id' in clause && clause.id) return clause.id.in.includes(user.id);
          if ('role' in clause && clause.role) return clause.role.in.includes(user.role);
          return false;
        });
      }
      return true;
    });
  });
  return { prisma: { user: { findMany } } as unknown as Pick<PrismaClient, 'user'>, findMany };
}

export const OFFICE = 'office-1';
export const OTHER_OFFICE = 'office-2';

/** Escritório de teste: responsável (LAWYER), 2 ADMINs ativos, 1 ADMIN inativo, 1 ASSISTANT e um ADMIN de outro escritório. */
export const TEAM: Record<string, FakeUser> = {
  lawyer: { id: 'lawyer-1', officeId: OFFICE, role: 'LAWYER', status: 'ACTIVE' },
  admin: { id: 'admin-1', officeId: OFFICE, role: 'ADMIN', status: 'ACTIVE' },
  admin2: { id: 'admin-2', officeId: OFFICE, role: 'ADMIN', status: 'ACTIVE' },
  adminInactive: { id: 'admin-off', officeId: OFFICE, role: 'ADMIN', status: 'INACTIVE' },
  assistant: { id: 'assistant-1', officeId: OFFICE, role: 'ASSISTANT', status: 'ACTIVE' },
  otherOfficeAdmin: { id: 'admin-x', officeId: OTHER_OFFICE, role: 'ADMIN', status: 'ACTIVE' },
};

export const ALL_USERS = Object.values(TEAM);
