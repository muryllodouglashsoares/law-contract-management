import { describe, expect, it, vi } from 'vitest';

import { ContractSignatureService } from '../../src/modules/contract-signatures/contract-signature.service';

const NOW = new Date('2026-10-01T12:00:00.000Z');

function makeService(opts: { claimCount?: number; pushRejects?: boolean } = {}) {
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
      responsibleId: 'lawyer-1',
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
  const prisma = {
    contractPublicSignature: { findUnique: vi.fn().mockResolvedValue(sig) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as ConstructorParameters<typeof ContractSignatureService>[0];
  const sendToUser = opts.pushRejects
    ? vi.fn().mockRejectedValue(new Error('push down'))
    : vi.fn().mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  const service = new ContractSignatureService(
    prisma,
    { publicAppUrl: 'https://app.test', expirationHours: 72, push: { sendToUser } },
    () => NOW,
  );
  return { service, tx, sendToUser };
}

const BODY = { signerName: 'João da Silva', signerDocument: '12345678909', accepted: true } as never;
const CTX = { ip: '203.0.113.9', userAgent: 'vitest' };

describe('ContractSignatureService — Web Push', () => {
  it('após o aceite envia 1 push ao advogado responsável, junto da Notification, sem dados do cliente', async () => {
    const { service, tx, sendToUser } = makeService();
    await service.sign('token', BODY, CTX);

    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith(
      { officeId: 'office-1', userId: 'lawyer-1' },
      {
        type: 'CONTRACT_SIGNED',
        title: 'Contrato assinado',
        body: 'O contrato #102 foi assinado pelo cliente.',
        url: '/contratos/c-1',
        tag: 'signed:c-1',
      },
    );
    expect(JSON.stringify(sendToUser.mock.calls)).not.toMatch(/João|12345678909|203\.0\.113\.9/);
  });

  it('não envia push se o link já foi usado (transação falha)', async () => {
    const { service, sendToUser } = makeService({ claimCount: 0 });
    await expect(service.sign('token', BODY, CTX)).rejects.toMatchObject({ statusCode: 410 });
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('falha do serviço de push não afeta o aceite (sem unhandled rejection)', async () => {
    const { service } = makeService({ pushRejects: true });
    await expect(service.sign('token', BODY, CTX)).resolves.toMatchObject({ signed: true, contractNumber: 102 });
  });
});
