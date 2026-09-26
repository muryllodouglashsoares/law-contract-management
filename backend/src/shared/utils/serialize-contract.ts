import type { Contract, ContractVersion } from '@prisma/client';

import { CONTRACT_STATUS_TO_API } from '../domain/status-map';
import { toMoneyNumber } from './money';

export type ContractWithRelations = Contract & {
  client: { id: string; name: string; document: string; email: string };
  template: { id: string; name: string };
  responsible: { id: string; name: string };
  versions: ContractVersion[];
};

export interface PublicContract {
  id: string;
  number: number;
  status: string;
  value: number;
  object: string;
  startDate: string;
  termText: string | null;
  conditions: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; document: string; email: string };
  template: { id: string; name: string };
  responsible: { id: string; name: string };
  currentVersion: { versionNumber: number; content: string; createdAt: string } | null;
}

export function toPublicContract(contract: ContractWithRelations): PublicContract {
  const currentVersion = contract.versions[0];

  return {
    id: contract.id,
    number: contract.number,
    status: CONTRACT_STATUS_TO_API(contract.status),
    value: toMoneyNumber(contract.value),
    object: contract.object,
    startDate: contract.startDate.toISOString(),
    termText: contract.termText,
    conditions: contract.conditions,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    client: contract.client,
    template: contract.template,
    responsible: contract.responsible,
    currentVersion: currentVersion
      ? {
          versionNumber: currentVersion.versionNumber,
          content: currentVersion.content,
          createdAt: currentVersion.createdAt.toISOString(),
        }
      : null,
  };
}
