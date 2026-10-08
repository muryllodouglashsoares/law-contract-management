import { describe, expect, it, vi } from 'vitest';

import {
  SignatureLinkAlertsJobService,
  buildExpiringDescription,
  buildNeverOpenedDescription,
} from '../../src/modules/contract-signatures/signature-link-alerts-job.service';

const NOW = new Date('2026-10-07T11:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3600_000);
const CONFIG = { enabled: true, neverOpenedHours: 24, expiringHours: 24 };

interface Sig {
  id: string;
  officeId: string;
  contractVersionId: string;
  createdAt: Date;
  expiresAt: Date;
  firstOpenedAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  contract: { id: string; number: number; status: string; responsibleId: string; versions: { id: string }[] };
}

function sig(id: string, overrides: Partial<Sig> = {}): Sig {
  return {
    id,
    officeId: 'office-1',
    contractVersionId: 'v-1',
    createdAt: hoursAgo(30),
    expiresAt: hoursAhead(42),
    firstOpenedAt: null,
    usedAt: null,
    revokedAt: null,
    contract: { id: 'c-1', number: 123, status: 'ENVIADO', responsibleId: 'lawyer-1', versions: [{ id: 'v-1' }] },
    ...overrides,
  };
}

/** Banco falso que interpreta o `where` do job (estado do link, contrato assinável, alertas já enviados). */
function makeFake(sigs: Sig[]) {
  const alerts = new Set<string>();
  const notifications: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];

  const matches = (s: Sig, where: any): boolean => {
    if (where.usedAt === null && s.usedAt !== null) return false;
    if (where.revokedAt === null && s.revokedAt !== null) return false;
    if (where.firstOpenedAt === null && s.firstOpenedAt !== null) return false;
    if (where.expiresAt?.gt && !(s.expiresAt > where.expiresAt.gt)) return false;
    if (where.expiresAt?.lte && !(s.expiresAt <= where.expiresAt.lte)) return false;
    if (where.createdAt?.lte && !(s.createdAt <= where.createdAt.lte)) return false;
    if (where.contract?.status?.in && !where.contract.status.in.includes(s.contract.status)) return false;
    if (where.alerts?.none && alerts.has(`${s.id}:${where.alerts.none.type}`)) return false;
    return true;
  };

  const findMany = vi.fn(async ({ where }: any) => sigs.filter((s) => matches(s, where)));
  const tx = {
    contractPublicSignature: { findFirst: vi.fn(async ({ where }: any) => (sigs.find((s) => s.id === where.id && matches(s, where)) ? { id: where.id } : null)) },
    signatureLinkAlert: {
      createMany: vi.fn(async ({ data }: any) => {
        let count = 0;
        for (const row of data) {
          const key = `${row.signatureId}:${row.type}`;
          if (!alerts.has(key)) {
            alerts.add(key);
            count += 1;
          }
        }
        return { count };
      }),
    },
    notification: { create: vi.fn(async ({ data }: any) => void notifications.push(data)) },
    auditLog: { create: vi.fn(async ({ data }: any) => void audits.push(data)) },
  };
  const prisma = { contractPublicSignature: { findMany }, $transaction: vi.fn(async (cb: any) => cb(tx)) } as any;
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const service = new SignatureLinkAlertsJobService(prisma, CONFIG, { dispatch } as any);
  return { service, notifications, audits, dispatch };
}

describe('SignatureLinkAlertsJobService', () => {
  it('alerta link enviado há mais de 24h e nunca aberto', async () => {
    const { service, notifications, dispatch } = makeFake([sig('s1', { createdAt: hoursAgo(30), expiresAt: hoursAhead(100) })]);
    const result = await service.run(NOW);

    expect(result.notified).toBe(1);
    expect(notifications[0]).toMatchObject({
      userId: 'lawyer-1',
      title: 'Cliente ainda não abriu o link de assinatura',
      description: 'O link do contrato #123 foi enviado há mais de 24 horas, mas ainda não foi aberto.',
    });
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ pushEvent: 'SIGNATURE_NEVER_OPENED', responsibleId: 'lawyer-1' });
  });

  it('não alerta "nunca aberto" quando o link é recente (< 24h) ou já foi aberto', async () => {
    const { service, notifications } = makeFake([
      sig('recent', { createdAt: hoursAgo(5), expiresAt: hoursAhead(100) }),
      sig('opened', { createdAt: hoursAgo(30), expiresAt: hoursAhead(100), firstOpenedAt: hoursAgo(2) }),
    ]);
    await service.run(NOW);
    expect(notifications).toHaveLength(0);
  });

  it('alerta link que expira em menos de 24h (mesmo já aberto)', async () => {
    const { service, notifications, dispatch } = makeFake([sig('s1', { createdAt: hoursAgo(60), expiresAt: hoursAhead(10), firstOpenedAt: hoursAgo(50) })]);
    await service.run(NOW);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ title: 'Link de assinatura próximo da expiração', description: 'O link do contrato #123 expira em menos de 24 horas.' });
    expect(dispatch.mock.calls[0]?.[0].pushEvent).toBe('SIGNATURE_EXPIRING');
  });

  it('link nunca aberto e perto de expirar gera os DOIS alertas (tipos distintos), uma vez cada', async () => {
    const { service, notifications } = makeFake([sig('s1', { createdAt: hoursAgo(60), expiresAt: hoursAhead(10) })]);
    await service.run(NOW);
    await service.run(NOW);
    expect(notifications).toHaveLength(2);
  });

  it('não alerta link usado, revogado ou expirado', async () => {
    const { service, notifications } = makeFake([
      sig('used', { usedAt: hoursAgo(1) }),
      sig('revoked', { revokedAt: hoursAgo(1) }),
      sig('expired', { expiresAt: hoursAgo(1) }),
    ]);
    await service.run(NOW);
    expect(notifications).toHaveLength(0);
  });

  it('não alerta quando o contrato deixou de ser assinável ou a versão não é mais a atual', async () => {
    const { service, notifications } = makeFake([
      sig('signed', { contract: { id: 'c-2', number: 5, status: 'ASSINADO', responsibleId: 'u', versions: [{ id: 'v-1' }] } }),
      sig('newer', { contract: { id: 'c-3', number: 6, status: 'ENVIADO', responsibleId: 'u', versions: [{ id: 'v-2' }] } }),
    ]);
    await service.run(NOW);
    expect(notifications).toHaveLength(0);
  });

  it('link com validade total ≤ janela não gera "próximo da expiração" desde a criação', async () => {
    const { service, notifications } = makeFake([sig('short', { createdAt: hoursAgo(1), expiresAt: hoursAhead(12), firstOpenedAt: hoursAgo(1) })]);
    await service.run(NOW);
    expect(notifications).toHaveLength(0);
  });

  it('execuções duplicada e concorrente não duplicam notificação, auditoria nem push', async () => {
    const { service, notifications, audits, dispatch } = makeFake([sig('s1', { createdAt: hoursAgo(30), expiresAt: hoursAhead(100) })]);
    await Promise.all([service.run(NOW), service.run(NOW)]);
    await service.run(NOW);
    expect(notifications).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('push não contém link, token, CPF nem nome do cliente', async () => {
    const { service, dispatch } = makeFake([sig('s1', { createdAt: hoursAgo(30), expiresAt: hoursAhead(100) })]);
    await service.run(NOW);
    const push = dispatch.mock.calls[0]?.[0].push;
    expect(JSON.stringify(push)).not.toMatch(/assinar|token|http/i);
    expect(push.url).toBe('/contratos/c-1');
  });

  it('desabilitado por configuração', async () => {
    const service = new SignatureLinkAlertsJobService({} as any, { ...CONFIG, enabled: false });
    expect(await service.run(NOW)).toMatchObject({ processed: 0, notified: 0, enabled: false });
  });

  it('textos respeitam a configuração de horas', () => {
    expect(buildNeverOpenedDescription(9, 48)).toContain('48 horas');
    expect(buildExpiringDescription(9, 1)).toContain('1 hora.');
  });
});
