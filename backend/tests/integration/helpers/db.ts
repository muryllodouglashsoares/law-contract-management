import { prisma } from '../../../src/shared/database/prisma';
import { hashPassword } from '../../../src/shared/auth/password';

/**
 * Remove todos os dados das tabelas usadas nos testes de integração.
 * TRUNCATE ... CASCADE evita ter que respeitar a ordem de dependência
 * das foreign keys manualmente.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "notifications", "payments", "documents", "contract_versions", "contracts", "contract_templates", "clients", "users", "offices" RESTART IDENTITY CASCADE',
  );
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

/** Cria um cliente e um modelo de contrato básicos, usados como pré-requisito
 * pelos testes de contratos/documentos/pagamentos. */
export async function createFixtureClientAndTemplate(
  officeId: string,
): Promise<{ clientId: string; templateId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const client = await prisma.client.create({
    data: {
      officeId,
      type: 'PF',
      name: 'Cliente de Teste',
      document: `doc-${suffix}`,
      email: `cliente-${suffix}@example.com`,
    },
  });

  const template = await prisma.contractTemplate.create({
    data: {
      officeId,
      name: 'Modelo de Teste',
      content: 'Contrato entre {{advogado.escritorio}} e {{cliente.nome}}, no valor de {{contrato.valor}}.',
    },
  });

  return { clientId: client.id, templateId: template.id };
}
