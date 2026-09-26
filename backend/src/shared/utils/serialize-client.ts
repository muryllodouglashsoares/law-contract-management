import type { Client } from '@prisma/client';

import { CLIENT_STATUS_TO_API } from '../domain/status-map';

/** Formato retornado pelo Prisma quando o client é buscado com os includes
 * usados por list()/getById() do ClientService (ver client.service.ts). */
export type ClientWithComputed = Client & {
  _count: { contracts: number };
  contracts: { updatedAt: Date }[];
};

export interface PublicClient {
  id: string;
  type: Client['type'];
  name: string;
  document: string;
  email: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  contractsCount: number;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicClient(client: ClientWithComputed): PublicClient {
  const latestContractActivity = client.contracts[0]?.updatedAt;
  const lastActivity =
    latestContractActivity && latestContractActivity > client.updatedAt
      ? latestContractActivity
      : client.updatedAt;

  return {
    id: client.id,
    type: client.type,
    name: client.name,
    document: client.document,
    email: client.email,
    phone: client.phone,
    address: client.address,
    notes: client.notes,
    status: CLIENT_STATUS_TO_API(client.status),
    contractsCount: client._count.contracts,
    lastActivity: lastActivity.toISOString(),
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}
