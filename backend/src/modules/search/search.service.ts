import type { PrismaClient, UserRole } from '@prisma/client';

type PrismaDeps = Pick<PrismaClient, 'client' | 'contract' | 'contractTemplate' | 'document' | 'user'>;

export interface SearchActor {
  officeId: string;
  role: UserRole;
}

export interface SearchResults {
  clients: { id: string; label: string; description: string | null }[];
  contracts: { id: string; number: number; label: string; description: string; clientName: string }[];
  templates: { id: string; label: string; description: string | null }[];
  documents: { id: string; label: string; description: string; contractId: string }[];
  users: { id: string; label: string; description: string }[];
}

const PREVIEW_LENGTH = 120;
// Número do contrato é Int de 32 bits; acima disso a comparação estouraria no Prisma.
const MAX_CONTRACT_NUMBER = 2_147_483_647;

/** Só o necessário para um preview (nunca o conteúdo integral de contratos/modelos). */
function preview(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

/** "#102" ou "102" → 102; qualquer outra coisa → null. */
function parseContractNumber(term: string): number | null {
  const match = /^#?(\d{1,10})$/.exec(term);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return value > 0 && value <= MAX_CONTRACT_NUMBER ? value : null;
}

/**
 * Busca global (PostgreSQL via Prisma, `contains` + `mode: insensitive`; o Prisma escapa
 * % e _ do termo). Regras de segurança:
 *  - TODA consulta filtra por `officeId` do usuário autenticado (nunca vindo do request);
 *  - `take` limita cada categoria — nunca há consulta sem limite;
 *  - os `select` devolvem só campos de navegação (sem passwordHash, storagePath,
 *    conteúdo de contrato, token etc.);
 *  - usuários só são pesquisados para ADMIN (mesma regra de GET /users).
 */
export class SearchService {
  constructor(private readonly prisma: PrismaDeps) {}

  async searchGlobal(actor: SearchActor, term: string, limit: number): Promise<SearchResults> {
    const { officeId } = actor;
    const contains = { contains: term, mode: 'insensitive' as const };
    const contractNumber = parseContractNumber(term);

    const [clients, contracts, templates, documents, users] = await Promise.all([
      this.prisma.client.findMany({
        where: {
          officeId,
          OR: [{ name: contains }, { document: contains }, { email: contains }],
        },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take: limit,
      }),
      this.prisma.contract.findMany({
        where: {
          officeId,
          OR: [
            { object: contains },
            { client: { name: contains } },
            ...(contractNumber !== null ? [{ number: contractNumber }] : []),
          ],
        },
        select: { id: true, number: true, object: true, client: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.contractTemplate.findMany({
        where: { officeId, name: contains },
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
        take: limit,
      }),
      this.prisma.document.findMany({
        where: { officeId, fileName: contains },
        select: {
          id: true,
          fileName: true,
          contract: { select: { id: true, number: true, client: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      actor.role === 'ADMIN'
        ? this.prisma.user.findMany({
            where: { officeId, OR: [{ name: contains }, { email: contains }] },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([] as { id: string; name: string; email: string }[]),
    ]);

    return {
      clients: clients.map((c) => ({ id: c.id, label: c.name, description: c.email })),
      contracts: contracts.map((c) => ({
        id: c.id,
        number: c.number,
        label: `Contrato #${c.number}`,
        description: preview(c.object) ?? '',
        clientName: c.client.name,
      })),
      templates: templates.map((t) => ({ id: t.id, label: t.name, description: preview(t.description) })),
      documents: documents.map((d) => ({
        id: d.id,
        label: d.fileName,
        description: `Contrato #${d.contract.number} · ${d.contract.client.name}`,
        contractId: d.contract.id,
      })),
      users: users.map((u) => ({ id: u.id, label: u.name, description: u.email })),
    };
  }
}
