export const clients = [
  { id: 1, name: 'João da Silva', document: '123.456.789-00', email: 'joao.silva@email.com', phone: '(11) 98765-4321', contracts: 3, status: 'ativo', lastActivity: '21/09/2026', type: 'PF' },
  { id: 2, name: 'Maria Oliveira', document: '987.654.321-00', email: 'maria.oliveira@gmail.com', phone: '(11) 91234-5678', contracts: 1, status: 'ativo', lastActivity: '19/09/2026', type: 'PF' },
  { id: 3, name: 'Empresa ABC Ltda.', document: '12.345.678/0001-90', email: 'contato@empresaabc.com.br', phone: '(11) 3333-4444', contracts: 5, status: 'ativo', lastActivity: '18/09/2026', type: 'PJ' },
  { id: 4, name: 'Carlos Eduardo Mendes', document: '456.789.123-00', email: 'carlos.mendes@outlook.com', phone: '(21) 99876-5432', contracts: 2, status: 'inativo', lastActivity: '10/09/2026', type: 'PF' },
  { id: 5, name: 'Tech Solutions S.A.', document: '98.765.432/0001-10', email: 'legal@techsolutions.com.br', phone: '(11) 4444-5555', contracts: 7, status: 'ativo', lastActivity: '20/09/2026', type: 'PJ' },
  { id: 6, name: 'Ana Paula Ferreira', document: '789.012.345-00', email: 'ana.ferreira@email.com', phone: '(31) 97654-3210', contracts: 1, status: 'ativo', lastActivity: '15/09/2026', type: 'PF' },
  { id: 7, name: 'Grupo Industrial Norte', document: '11.222.333/0001-44', email: 'juridico@ginorte.com.br', phone: '(92) 3210-9876', contracts: 4, status: 'ativo', lastActivity: '17/09/2026', type: 'PJ' },
];

export const contracts = [
  { id: 102, client: 'João da Silva', clientId: 1, template: 'Prestação de Serviços Jurídicos', status: 'ativo', value: 4800.00, createdAt: '01/09/2026', updatedAt: '21/09/2026' },
  { id: 101, client: 'Empresa ABC Ltda.', clientId: 3, template: 'Assessoria Jurídica', status: 'assinado', value: 12000.00, createdAt: '15/08/2026', updatedAt: '20/09/2026' },
  { id: 100, client: 'Tech Solutions S.A.', clientId: 5, template: 'Consultoria Jurídica', status: 'em_revisao', value: 8500.00, createdAt: '10/08/2026', updatedAt: '18/09/2026' },
  { id: 99, client: 'Maria Oliveira', clientId: 2, template: 'Prestação de Serviços Jurídicos', status: 'enviado', value: 2400.00, createdAt: '05/09/2026', updatedAt: '19/09/2026' },
  { id: 98, client: 'Carlos Eduardo Mendes', clientId: 4, template: 'Consultoria Jurídica', status: 'encerrado', value: 6000.00, createdAt: '01/07/2026', updatedAt: '01/09/2026' },
  { id: 97, client: 'Tech Solutions S.A.', clientId: 5, template: 'Assessoria Jurídica', status: 'ativo', value: 15000.00, createdAt: '01/06/2026', updatedAt: '15/09/2026' },
  { id: 96, client: 'Grupo Industrial Norte', clientId: 7, template: 'Prestação de Serviços Jurídicos', status: 'rascunho', value: 9200.00, createdAt: '20/09/2026', updatedAt: '21/09/2026' },
  { id: 95, client: 'Ana Paula Ferreira', clientId: 6, template: 'Prestação de Serviços Jurídicos', status: 'cancelado', value: 1800.00, createdAt: '15/07/2026', updatedAt: '15/08/2026' },
];

export const templates = [
  { id: 1, name: 'Prestação de Serviços Jurídicos', description: 'Contrato padrão para prestação de serviços jurídicos individuais', uses: 24, updatedAt: '10/09/2026', status: 'ativo' },
  { id: 2, name: 'Consultoria Jurídica', description: 'Modelo para contratos de consultoria avulsa e por hora', uses: 12, updatedAt: '05/08/2026', status: 'ativo' },
  { id: 3, name: 'Assessoria Jurídica', description: 'Assessoria contínua para pessoas jurídicas', uses: 8, updatedAt: '01/09/2026', status: 'ativo' },
  { id: 4, name: 'Defesa Trabalhista', description: 'Contrato específico para processos trabalhistas', uses: 6, updatedAt: '20/08/2026', status: 'ativo' },
  { id: 5, name: 'Honorários Advocatícios', description: 'Contrato de honorários com cláusulas de êxito', uses: 3, updatedAt: '15/09/2026', status: 'rascunho' },
];

export const payments = [
  { id: 1, client: 'João da Silva', contractId: 102, installment: '1/3', value: 1600.00, dueDate: '30/09/2026', status: 'pendente', method: null },
  { id: 2, client: 'Empresa ABC Ltda.', contractId: 101, installment: '2/4', value: 3000.00, dueDate: '25/09/2026', status: 'pendente', method: null },
  { id: 3, client: 'Tech Solutions S.A.', contractId: 97, installment: '4/12', value: 1250.00, dueDate: '15/09/2026', status: 'pago', method: 'PIX' },
  { id: 4, client: 'João da Silva', contractId: 102, installment: '2/3', value: 1600.00, dueDate: '30/10/2026', status: 'futuro', method: null },
  { id: 5, client: 'Maria Oliveira', contractId: 99, installment: '1/2', value: 1200.00, dueDate: '10/09/2026', status: 'atrasado', method: null },
  { id: 6, client: 'Tech Solutions S.A.', contractId: 97, installment: '3/12', value: 1250.00, dueDate: '15/08/2026', status: 'pago', method: 'Transferência' },
  { id: 7, client: 'Empresa ABC Ltda.', contractId: 101, installment: '1/4', value: 3000.00, dueDate: '25/08/2026', status: 'pago', method: 'PIX' },
];

export const documents = [
  { id: 1, name: 'Contrato_102_Assinado.pdf', type: 'PDF', client: 'João da Silva', contractId: 102, size: '245 KB', date: '21/09/2026', category: 'contrato' },
  { id: 2, name: 'Procuracao_JoaoSilva.pdf', type: 'PDF', client: 'João da Silva', contractId: 102, size: '128 KB', date: '15/09/2026', category: 'procuração' },
  { id: 3, name: 'Comprovante_Residencia_Maria.pdf', type: 'PDF', client: 'Maria Oliveira', contractId: 99, size: '89 KB', date: '05/09/2026', category: 'documento' },
  { id: 4, name: 'Contrato_ABC_Assinado.docx', type: 'DOCX', client: 'Empresa ABC Ltda.', contractId: 101, size: '310 KB', date: '20/09/2026', category: 'contrato' },
  { id: 5, name: 'Ata_Reuniao_TechSolutions.pdf', type: 'PDF', client: 'Tech Solutions S.A.', contractId: 100, size: '156 KB', date: '18/09/2026', category: 'outro' },
];

export const notifications = [
  { id: 1, type: 'warning', title: 'Pagamento vence amanhã', description: 'Parcela 2/3 de Maria Oliveira — R$ 1.200,00', date: '21/09/2026', read: false, priority: true },
  { id: 2, type: 'info', title: 'Contrato aguardando assinatura', description: 'Contrato #99 enviado a Maria Oliveira está aguardando resposta há 16 dias', date: '21/09/2026', read: false, priority: true },
  { id: 3, type: 'success', title: 'Contrato assinado', description: 'Contrato #101 foi assinado por Empresa ABC Ltda.', date: '20/09/2026', read: false, priority: false },
  { id: 4, type: 'warning', title: 'Contrato vence em 30 dias', description: 'Contrato #102 com João da Silva vence em 01/10/2026', date: '19/09/2026', read: true, priority: false },
  { id: 5, type: 'info', title: 'Novo documento adicionado', description: 'Procuração_JoaoSilva.pdf foi adicionado ao Contrato #102', date: '15/09/2026', read: true, priority: false },
];

export const history = [
  { id: 1, date: '21/09/2026', time: '14:32', user: 'Muryllo', action: 'criou o contrato', target: 'Contrato #102', type: 'create' },
  { id: 2, date: '21/09/2026', time: '14:40', user: 'Sistema', action: 'gerou o PDF do', target: 'Contrato #102', type: 'pdf' },
  { id: 3, date: '21/09/2026', time: '15:05', user: 'Muryllo', action: 'enviou o', target: 'Contrato #102', type: 'send' },
  { id: 4, date: '20/09/2026', time: '09:12', user: 'João da Silva', action: 'visualizou o', target: 'Contrato #102', type: 'view' },
  { id: 5, date: '20/09/2026', time: '10:02', user: 'João da Silva', action: 'assinou o', target: 'Contrato #102', type: 'sign' },
  { id: 6, date: '19/09/2026', time: '16:22', user: 'Muryllo', action: 'cadastrou o cliente', target: 'Ana Paula Ferreira', type: 'create' },
  { id: 7, date: '19/09/2026', time: '16:45', user: 'Muryllo', action: 'registrou pagamento do', target: 'Contrato #97', type: 'payment' },
  { id: 8, date: '18/09/2026', time: '11:00', user: 'Muryllo', action: 'atualizou o modelo', target: 'Prestação de Serviços Jurídicos', type: 'update' },
];

export const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  rascunho:       { label: 'Rascunho',          color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8' },
  pronto_envio:   { label: 'Pronto p/ envio',   color: '#2563EB', bg: '#EFF6FF', dot: '#3B82F6' },
  enviado:        { label: 'Enviado',            color: '#2563EB', bg: '#EFF6FF', dot: '#60A5FA' },
  em_revisao:     { label: 'Em revisão',         color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
  assinado:       { label: 'Assinado',           color: '#0D9488', bg: '#F0FDFA', dot: '#14B8A6' },
  ativo:          { label: 'Ativo',              color: '#059669', bg: '#F0FDF4', dot: '#10B981' },
  encerrado:      { label: 'Encerrado',          color: '#475569', bg: '#F1F5F9', dot: '#64748B' },
  cancelado:      { label: 'Cancelado',          color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444' },
  inativo:        { label: 'Inativo',            color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8' },
  pendente:       { label: 'Pendente',           color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
  pago:           { label: 'Pago',               color: '#059669', bg: '#F0FDF4', dot: '#10B981' },
  atrasado:       { label: 'Atrasado',           color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444' },
  futuro:         { label: 'A vencer',           color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8' },
};

export const contractStatusChart = [
  { name: 'Rascunho', value: 3, color: '#94A3B8' },
  { name: 'Enviado', value: 4, color: '#60A5FA' },
  { name: 'Em revisão', value: 2, color: '#F59E0B' },
  { name: 'Assinado', value: 5, color: '#14B8A6' },
  { name: 'Ativo', value: 8, color: '#10B981' },
  { name: 'Encerrado', value: 6, color: '#64748B' },
];
