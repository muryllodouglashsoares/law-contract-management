import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/shared/auth/password';

const prisma = new PrismaClient();

/**
 * Dados de desenvolvimento. NUNCA utilize estas credenciais em produção.
 * Rode com: npm run db:seed
 */
async function main() {
  console.log('🌱 Iniciando seed...');

  const office = await prisma.office.upsert({
    where: { email: 'contato@rochaadvocacia.com.br' },
    update: {},
    create: {
      name: 'Rocha Advocacia & Consultoria Jurídica',
      email: 'contato@rochaadvocacia.com.br',
      phone: '(11) 3456-7890',
      document: '12.345.678/0001-90',
    },
  });

  const devPassword = 'Senha@123';
  const passwordHash = await hashPassword(devPassword);

  const admin = await prisma.user.upsert({
    where: { email: 'muryllo@escritorio.com.br' },
    update: {},
    create: {
      officeId: office.id,
      name: 'Muryllo Rocha',
      email: 'muryllo@escritorio.com.br',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const lawyer = await prisma.user.upsert({
    where: { email: 'advogado@escritorio.com.br' },
    update: {},
    create: {
      officeId: office.id,
      name: 'Ana Paula Ferreira',
      email: 'advogado@escritorio.com.br',
      passwordHash,
      role: 'LAWYER',
      status: 'ACTIVE',
    },
  });

  const assistant = await prisma.user.upsert({
    where: { email: 'assistente@escritorio.com.br' },
    update: {},
    create: {
      officeId: office.id,
      name: 'Carlos Eduardo Mendes',
      email: 'assistente@escritorio.com.br',
      passwordHash,
      role: 'ASSISTANT',
      status: 'ACTIVE',
    },
  });

  console.log('✅ Seed concluído:');
  console.log(`   Escritório: ${office.name} (${office.id})`);
  console.log('   Usuários de desenvolvimento (senha para todos: "Senha@123"):');
  console.log(`     ADMIN     — ${admin.email}`);
  console.log(`     LAWYER    — ${lawyer.email}`);
  console.log(`     ASSISTANT — ${assistant.email}`);
  console.log('   ⚠️  Estas credenciais são apenas para desenvolvimento. Nunca as utilize em produção.');
}

main()
  .catch((error) => {
    console.error('❌ Erro ao rodar o seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
