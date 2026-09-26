import type { ContractTemplate } from '@prisma/client';

import { TEMPLATE_STATUS_TO_API } from '../domain/status-map';

export type ContractTemplateWithComputed = ContractTemplate & {
  _count: { contracts: number };
};

export interface PublicContractTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  status: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toPublicContractTemplate(template: ContractTemplateWithComputed): PublicContractTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    content: template.content,
    status: TEMPLATE_STATUS_TO_API(template.status),
    usageCount: template._count.contracts,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
