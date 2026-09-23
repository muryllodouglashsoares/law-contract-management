import { prisma } from '../../../src/shared/database/prisma';
import { hashPassword } from '../../../src/shared/auth/password';

/**
 * Remove todos os dados das tabelas usadas nos testes de integração.
 * TRUNCATE ... CASCADE evita ter que respeitar a ordem de dependência
 * das foreign keys manualmente.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "offices" RESTART IDENTITY CASCADE');
}

export interface TestFixture {
  officeId: string;
  userId: string;
  email: string;
  password: string;
}

/** Cria um escritório e um usuário ADMIN ativo para uso nos testes. */
export async function createFixtureUser(
  overrides: Partial<{ role: 'ADMIN' | 'LAWYER' | 'ASSISTANT'; status: 'ACTIVE' | 'INACTIVE' }> = {},
): Promise<TestFixture> {
  const office = await prisma.office.create({
    data: {
      name: 'Escritório de Teste',
      email: `office-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      document: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });

  const password = 'Senha@123';
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      officeId: office.id,
      name: 'Usuário de Teste',
      email: `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash,
      role: overrides.role ?? 'ADMIN',
      status: overrides.status ?? 'ACTIVE',
    },
  });

  return { officeId: office.id, userId: user.id, email: user.email, password };
}
