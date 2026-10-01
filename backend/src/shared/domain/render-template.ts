/**
 * Substitui variáveis no formato {{grupo.campo}} pelo valor correspondente
 * em `variables` (mesma chave, ex.: "cliente.nome"). Variáveis sem valor
 * disponível são mantidas no texto como estavam, para deixar visível ao
 * usuário o que ainda falta preencher — nunca lançamos erro aqui, pois o
 * template pode legitimamente conter variáveis opcionais.
 */
export function renderTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? (variables[key] ?? match) : match;
  });
}

function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString('pt-BR');
}

export interface ContractTemplateVariablesInput {
  client: { name: string; document: string; email: string; phone: string | null; address: string | null };
  contract: {
    object: string;
    value: number;
    startDate: Date;
    /** Opcional para manter compatibilidade com chamadores/contratos antigos. */
    endDate?: Date | null;
    termText: string | null;
    number: number;
  };
  lawyer: { name: string; email: string; oabNumber: string | null };
  office: { name: string };
}

/** Monta o dicionário de variáveis disponíveis para um contrato, no mesmo
 * conjunto já anunciado ao usuário no editor de modelos (TemplatesPage). */
export function buildContractTemplateVariables(input: ContractTemplateVariablesInput): Record<string, string> {
  return {
    'cliente.nome': input.client.name,
    'cliente.cpf': input.client.document,
    'cliente.email': input.client.email,
    'cliente.telefone': input.client.phone ?? '',
    'cliente.endereco': input.client.address ?? '',
    'contrato.valor': formatCurrencyBRL(input.contract.value),
    'contrato.data_inicio': formatDateBR(input.contract.startDate),
    'contrato.data_fim': input.contract.endDate ? formatDateBR(input.contract.endDate) : '',
    'contrato.prazo': input.contract.termText ?? '',
    'contrato.objeto': input.contract.object,
    'contrato.numero': String(input.contract.number),
    'advogado.nome': input.lawyer.name,
    'advogado.oab': input.lawyer.oabNumber ?? '',
    'advogado.email': input.lawyer.email,
    'advogado.escritorio': input.office.name,
  };
}
