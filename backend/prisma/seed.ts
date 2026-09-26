import { PrismaClient } from '@prisma/client';

import { buildContractTemplateVariables, renderTemplate } from '../src/shared/domain/render-template';
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
      address: 'Av. Paulista, 1000, 10º andar - São Paulo/SP',
      specialties: 'Direito Civil, Direito Empresarial, Direito Trabalhista',
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
      phone: '(11) 98888-7777',
      oabNumber: 'OAB/SP 123.456',
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
      phone: '(11) 97777-6666',
      oabNumber: 'OAB/SP 234.567',
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

  // --- Clientes, modelos, contratos, pagamentos e notificações -----------
  // Bloco só roda na primeira vez (idempotente): reaproveita o escritório/
  // usuários acima via upsert, mas os dados de negócio não têm uma chave
  // natural simples para todos os domínios, então evitamos duplicar
  // checando se já existe algo cadastrado para este escritório.
  const existingClients = await prisma.client.count({ where: { officeId: office.id } });

  if (existingClients === 0) {
    console.log('🌱 Semeando clientes, modelos e contratos de exemplo...');

    const clientMaria = await prisma.client.create({
      data: {
        officeId: office.id,
        type: 'PF',
        name: 'Maria Fernanda Costa',
        document: '111.444.777-35',
        email: 'maria.costa@example.com',
        phone: '(11) 99999-1111',
        address: 'Rua das Flores, 123 - São Paulo/SP',
        status: 'ACTIVE',
      },
    });

    const clientTech = await prisma.client.create({
      data: {
        officeId: office.id,
        type: 'PJ',
        name: 'TechNova Soluções Ltda.',
        document: '12.345.678/0001-99',
        email: 'contato@technova.com.br',
        phone: '(11) 4002-8888',
        address: 'Av. Faria Lima, 2000 - São Paulo/SP',
        status: 'ACTIVE',
      },
    });

    const clientJoao = await prisma.client.create({
      data: {
        officeId: office.id,
        type: 'PF',
        name: 'João Pedro Almeida',
        document: '222.555.888-46',
        email: 'joao.almeida@example.com',
        phone: '(11) 98888-2222',
        status: 'INACTIVE',
        notes: 'Cliente inativo — último contrato encerrado.',
      },
    });

    const templateConsultoria = await prisma.contractTemplate.create({
      data: {
        officeId: office.id,
        name: 'Contrato de Prestação de Serviços de Consultoria',
        description: 'Modelo padrão para consultoria jurídica recorrente',
        status: 'ACTIVE',
        content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA JURÍDICA

CONTRATANTE: {{cliente.nome}}, portador(a) do documento {{cliente.cpf}}, com endereço em {{cliente.endereco}}, e-mail {{cliente.email}}.

CONTRATADO: {{advogado.escritorio}}, representado por {{advogado.nome}}, inscrito(a) na {{advogado.oab}}.

OBJETO: {{contrato.objeto}}

VALOR: {{contrato.valor}}
PRAZO: {{contrato.prazo}}
DATA DE INÍCIO: {{contrato.data_inicio}}

As partes firmam o presente contrato de prestação de serviços de consultoria jurídica, obrigando-se a cumprir integralmente as cláusulas aqui estabelecidas.`,
      },
    });

    const templateHonorarios = await prisma.contractTemplate.create({
      data: {
        officeId: office.id,
        name: 'Contrato de Honorários Advocatícios',
        description: 'Modelo para atuação em processo judicial específico',
        status: 'ACTIVE',
        content: `CONTRATO DE HONORÁRIOS ADVOCATÍCIOS Nº {{contrato.numero}}

CONTRATANTE: {{cliente.nome}} ({{cliente.cpf}})
CONTRATADO: {{advogado.nome}} — {{advogado.oab}}

OBJETO: {{contrato.objeto}}
HONORÁRIOS: {{contrato.valor}}
DATA: {{contrato.data_inicio}}`,
      },
    });

    await prisma.contractTemplate.create({
      data: {
        officeId: office.id,
        name: 'Procuração Ad Judicia',
        description: 'Modelo de procuração para representação judicial',
        status: 'DRAFT',
        content: `PROCURAÇÃO

OUTORGANTE: {{cliente.nome}}, {{cliente.cpf}}
OUTORGADO: {{advogado.nome}}, {{advogado.oab}}

Pelo presente instrumento, o(a) outorgante nomeia e constitui seu(sua) procurador(a) o(a) outorgado(a), conferindo-lhe amplos poderes para representá-lo(a) judicial e extrajudicialmente.`,
      },
    });

    /** Cria um contrato + sua primeira versão renderizada, replicando a
     * mesma lógica usada em ContractService.create (ver contract.service.ts). */
    async function seedContract(input: {
      client: typeof clientMaria;
      template: typeof templateConsultoria;
      responsibleId: string;
      value: number;
      object: string;
      startDate: Date;
      termText?: string;
      status?: 'RASCUNHO' | 'PRONTO_ENVIO' | 'ENVIADO' | 'EM_REVISAO' | 'ASSINADO' | 'ATIVO' | 'ENCERRADO' | 'CANCELADO';
    }) {
      const contract = await prisma.contract.create({
        data: {
          officeId: office.id,
          clientId: input.client.id,
          templateId: input.template.id,
          responsibleId: input.responsibleId,
          value: input.value,
          object: input.object,
          startDate: input.startDate,
          termText: input.termText,
          status: input.status ?? 'RASCUNHO',
        },
      });

      const responsible = admin.id === input.responsibleId ? admin : lawyer;
      const variables = buildContractTemplateVariables({
        client: {
          name: input.client.name,
          document: input.client.document,
          email: input.client.email,
          phone: input.client.phone,
          address: input.client.address,
        },
        contract: {
          object: input.object,
          value: input.value,
          startDate: input.startDate,
          termText: input.termText ?? null,
          number: contract.number,
        },
        lawyer: { name: responsible.name, email: responsible.email, oabNumber: responsible.oabNumber },
        office: { name: office.name },
      });

      await prisma.contractVersion.create({
        data: {
          contractId: contract.id,
          versionNumber: 1,
          content: renderTemplate(input.template.content, variables),
          authorId: input.responsibleId,
        },
      });

      return contract;
    }

    const contractAtivo = await seedContract({
      client: clientTech,
      template: templateConsultoria,
      responsibleId: admin.id,
      value: 8500,
      object: 'Consultoria jurídica empresarial recorrente, incluindo revisão de contratos e pareceres mensais.',
      startDate: new Date('2025-11-01'),
      termText: '12 meses',
      status: 'ATIVO',
    });

    const contractEnviado = await seedContract({
      client: clientMaria,
      template: templateHonorarios,
      responsibleId: lawyer.id,
      value: 3200,
      object: 'Atuação em processo de indenização por danos morais.',
      startDate: new Date('2026-02-01'),
      status: 'ENVIADO',
    });

    await seedContract({
      client: clientMaria,
      template: templateConsultoria,
      responsibleId: admin.id,
      value: 1500,
      object: 'Consultoria pontual sobre direito de família.',
      startDate: new Date('2026-01-10'),
      status: 'RASCUNHO',
    });

    await seedContract({
      client: clientJoao,
      template: templateHonorarios,
      responsibleId: lawyer.id,
      value: 4200,
      object: 'Assessoria em processo trabalhista, já encerrado.',
      startDate: new Date('2025-06-01'),
      termText: '6 meses',
      status: 'ENCERRADO',
    });

    // Pagamentos: uma parcela paga, uma futura e uma atrasada.
    await prisma.payment.create({
      data: {
        officeId: office.id,
        contractId: contractAtivo.id,
        installmentNumber: 1,
        installmentTotal: 12,
        value: 8500,
        dueDate: new Date('2025-11-05'),
        status: 'PAID',
        method: 'PIX',
        paidAt: new Date('2025-11-04'),
      },
    });
    await prisma.payment.create({
      data: {
        officeId: office.id,
        contractId: contractAtivo.id,
        installmentNumber: 2,
        installmentTotal: 12,
        value: 8500,
        dueDate: new Date('2025-12-05'),
        status: 'PENDING',
      },
    });
    await prisma.payment.create({
      data: {
        officeId: office.id,
        contractId: contractEnviado.id,
        installmentNumber: 1,
        installmentTotal: 1,
        value: 3200,
        dueDate: new Date('2026-03-01'),
        status: 'PENDING',
      },
    });

    // Notificações de exemplo para o ADMIN.
    await prisma.notification.create({
      data: {
        officeId: office.id,
        userId: admin.id,
        type: 'WARNING',
        title: 'Pagamento em atraso',
        description: `A parcela do contrato #${contractAtivo.number} está atrasada.`,
        priority: true,
      },
    });
    await prisma.notification.create({
      data: {
        officeId: office.id,
        userId: admin.id,
        type: 'INFO',
        title: 'Contrato enviado',
        description: `O contrato #${contractEnviado.number} foi enviado para assinatura.`,
      },
    });

    // Registro de auditoria de exemplo (os módulos reais escrevem isso
    // automaticamente a cada ação — ver shared/domain/audit.ts).
    await prisma.auditLog.create({
      data: {
        officeId: office.id,
        actorId: admin.id,
        action: 'criou',
        entityType: 'Contract',
        entityId: contractAtivo.id,
        entityLabel: `Contrato #${contractAtivo.number}`,
      },
    });

    console.log(`   Clientes: 3 · Modelos: 3 · Contratos: 4 · Pagamentos: 3 · Notificações: 2`);
  } else {
    console.log('↩️  Dados de negócio já existiam para este escritório — pulando.');
  }

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
