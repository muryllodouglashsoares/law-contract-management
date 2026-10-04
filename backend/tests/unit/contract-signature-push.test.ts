import { describe, expect, it, vi } from 'vitest';

import { ContractSignatureService } from '../../src/modules/contract-signatures/contract-signature.service';
import { ALL_USERS, TEAM, makeFakeUserDb } from './helpers-push-recipients';

const NOW = new Date('2026-10-01T12:00:00.000Z');

function makeService(opts: { claimCount?: number; pushRejects?: boolean; responsibleId?: string } = {}) {
  const sig = {
    id: 'sig-1',
    officeId: 'office-1',
    contractId: 'c-1',
    contractVersionId: 'v-1',
    usedAt: null,
    revokedAt: null,
    expiresAt: new Date('2026-10-03T12:00:00.000Z'),
    contractVersion: { id: 'v-1', versionNumber: 1, content: 'texto', createdAt: NOW },
    contract: {
      id: 'c-1',
      number: 102,
      status: 'ENVIADO',
      responsibleId: opts.responsibleId ?? 'lawyer-1',
      client: { name: 'João da Silva' },
      office: { name: 'Escritório' },
      versions: [{ id: 'v-1' }],
    },
  };
  const tx = {
    contractPublicSignature: { updateMany: vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }) },
    contract: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    notification: { create: vi.fn().mockResolvedValue({}) },
  };
  const userDb = makeFakeUserDb(ALL_USERS);
  const prisma = {
    contractPublicSignature: { findUnique: vi.fn().mockResolvedValue(sig) },
    user: userDb.prisma.user,
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as ConstructorParameters<typeof ContractSignatureService>[0];
  const sendToUsers = opts.pushRejects
    ? vi.fn().mockRejectedValue(new Error('push down'))
    : vi.fn().mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  const sendToUser = vi.fn();
  const service = new ContractSignatureService(
    prisma,
    { publicAppUrl: 'https://app.test', expirationHours: 72, push: { sendToUser, sendToUsers } },
    () => NOW,
  );
  return { service, tx, sendToUsers, sendToUser, userFindMany: userDb.findMany };
}

const BODY = { signerName: 'João da Silva', signerDocument: '12345678909', accepted: true } as never;
const CTX = { ip: '203.0.113.9', userAgent: 'vitest' };

const recipientIds = (call: unknown[] | undefined) => ((call?.[0] ?? []) as { userId: string }[]).map((r) => r.userId);

describe('ContractSignatureService — Web Push', () => {
  it('após o aceite envia 1 fan-out ao responsável + ADMINs ativos, junto da Notification, sem dados do cliente', async () => {
    const { service, tx, sendToUsers, sendToUser } = makeService();
    await service.sign('token', BODY, CTX);
    await vi.waitFor(() => expect(sendToUsers).toHaveBeenCalledTimes(1));

    // A Notification interna continua só para o responsável.
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create.mock.calls[0]?.[0].data.userId).toBe('lawyer-1');

    expect(sendToUser).not.toHaveBeenCalled();
    const call = sendToUsers.mock.calls[0];
    expect(recipientIds(call)[0]).toBe('lawyer-1');
    expect(recipientIds(call).sort()).toEqual(['admin-1', 'admin-2', 'lawyer-1']);
    expect(call?.[1]).toEqual({
      type: 'CONTRACT_SIGNED',
      title: 'Contrato assinado',
      body: 'O contrato #102 foi assinado pelo cliente.',
      url: '/contratos/c-1',
      tag: 'signed:c-1',
    });
    expect(JSON.stringify(sendToUsers.mock.calls)).not.toMatch(/João|12345678909|203\.0\.113\.9/);
  });

  it('responsável ADMIN não recebe duplicado', async () => {
    const { service, sendToUsers } = makeService({ responsibleId: TEAM.admin!.id });
    await service.sign('token', BODY, CTX);
    await vi.waitFor(() => expect(sendToUsers).toHaveBeenCalledTimes(1));

    const ids = recipientIds(sendToUsers.mock.calls[0]);
    expect(ids.filter((id) => id === 'admin-1')).toHaveLength(1);
    expect(ids.sort()).toEqual(['admin-1', 'admin-2']);
  });

  it('ADMIN inativo, ASSISTANT e ADMIN de outro escritório não entram nos destinatários', async () => {
    const { service, sendToUsers } = makeService();
    await service.sign('token', BODY, CTX);
    await vi.waitFor(() => expect(sendToUsers).toHaveBeenCalledTimes(1));

    const ids = recipientIds(sendToUsers.mock.calls[0]);
    for (const excluded of [TEAM.adminInactive!.id, TEAM.assistant!.id, TEAM.otherOfficeAdmin!.id]) {
      expect(ids).not.toContain(excluded);
    }
  });

  it('não envia push (nem consulta destinatários) se o link já foi usado (transação falha)', async () => {
    const { service, sendToUsers, userFindMany } = makeService({ claimCount: 0 });
    await expect(service.sign('token', BODY, CTX)).rejects.toMatchObject({ statusCode: 410 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendToUsers).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('falha do serviço de push não afeta o aceite (sem unhandled rejection)', async () => {
    const { service, sendToUsers } = makeService({ pushRejects: true });
    await expect(service.sign('token', BODY, CTX)).resolves.toMatchObject({ signed: true, contractNumber: 102 });
    await vi.waitFor(() => expect(sendToUsers).toHaveBeenCalled());
  });

  it('falha ao consultar destinatários também não afeta o aceite', async () => {
    const { service, userFindMany } = makeService();
    userFindMany.mockRejectedValue(new Error('db down'));
    await expect(service.sign('token', BODY, CTX)).resolves.toMatchObject({ signed: true });
  });
});
