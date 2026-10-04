import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ContractRenewalJobService } from '../../src/modules/contract-renewal/contract-renewal-job.service';
import { ContractSignatureService } from '../../src/modules/contract-signatures/contract-signature.service';
import { notifyPushEvent } from '../../src/modules/notifications/push-recipients';
import { PushService } from '../../src/modules/notifications/push.service';
import type { WebPushSender } from '../../src/modules/notifications/push.types';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureContract, createFixtureUser, resetDatabase } from './helpers/db';

/**
 * Web Push para responsável + ADMINs, contra o banco real (consultas de destinatários e de
 * subscriptions com o Prisma de verdade) e com um sender FALSO — nenhum push real é enviado.
 */
const endpoint = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;
const NOW = new Date('2026-10-01T11:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset));

function makePush(send: WebPushSender['send'] = async () => undefined) {
  const sender = { send: vi.fn(send) } satisfies WebPushSender;
  const push = new PushService(prisma, sender, 'PUBLIC_KEY', { warn: vi.fn() });
  const sentEndpoints = () => sender.send.mock.calls.map((call) => call[0].endpoint).sort();
  return { push, sender, sentEndpoints };
}

async function subscribe(user: { userId: string; officeId: string }, ...ids: string[]) {
  for (const id of ids) {
    await prisma.pushSubscription.create({
      data: { officeId: user.officeId, userId: user.userId, endpoint: endpoint(id), p256dh: 'p', auth: 'a' },
    });
  }
}

/** Escritório: responsável (LAWYER, 2 dispositivos), ADMIN ativo (2), ADMIN inativo, ASSISTANT e um ADMIN de OUTRO escritório. */
async function setupOffice() {
  const lawyer = await createFixtureUser({ role: 'LAWYER' });
  const admin = await createFixtureUser({ officeId: lawyer.officeId, role: 'ADMIN' });
  const adminInactive = await createFixtureUser({ officeId: lawyer.officeId, role: 'ADMIN', status: 'INACTIVE' });
  const assistant = await createFixtureUser({ officeId: lawyer.officeId, role: 'ASSISTANT' });
  const outsider = await createFixtureUser({ role: 'ADMIN' });

  await subscribe(lawyer, 'lawyer-pc', 'lawyer-phone');
  await subscribe(admin, 'admin-pc', 'admin-notebook');
  await subscribe(adminInactive, 'admin-off-pc');
  await subscribe(assistant, 'assistant-pc');
  await subscribe(outsider, 'outsider-pc');
  return { lawyer, admin, adminInactive, assistant, outsider };
}

const EXPECTED_ALL = [endpoint('admin-notebook'), endpoint('admin-pc'), endpoint('lawyer-pc'), endpoint('lawyer-phone')].sort();

describe('Web Push — responsável + ADMINs (banco real)', () => {
  beforeAll(async () => {
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('responsável e ADMIN ativo recebem em TODOS os dispositivos; inativo, assistente e outro escritório não', async () => {
    const team = await setupOffice();
    const { push, sentEndpoints } = makePush();

    await notifyPushEvent(
      { prisma, push },
      'CONTRACT_SIGNED',
      { officeId: team.lawyer.officeId, responsibleId: team.lawyer.userId },
      { type: 'CONTRACT_SIGNED', title: 'Contrato assinado', body: 'O contrato #1 foi assinado pelo cliente.', url: '/contratos/c-1' },
    );

    expect(sentEndpoints()).toEqual(EXPECTED_ALL);
  });

  it('responsável que também é ADMIN recebe UMA vez por dispositivo (sem duplicar)', async () => {
    const team = await setupOffice();
    const { push, sender, sentEndpoints } = makePush();

    await notifyPushEvent(
      { prisma, push },
      'CONTRACT_RENEWAL',
      { officeId: team.admin.officeId, responsibleId: team.admin.userId },
      { type: 'CONTRACT_RENEWAL', title: 'Contrato próximo do vencimento', body: 'O contrato #1 vence hoje.' },
    );

    // Destinatário único: o ADMIN responsável (2 dispositivos). O LAWYER não é ADMIN nem responsável neste evento.
    expect(sentEndpoints()).toEqual([endpoint('admin-notebook'), endpoint('admin-pc')]);
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('remove subscriptions 404/410 do banco e mantém as válidas', async () => {
    const team = await setupOffice();
    const { push } = makePush(async (target) => {
      if (target.endpoint === endpoint('admin-pc')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (target.endpoint === endpoint('lawyer-phone')) throw Object.assign(new Error('nf'), { statusCode: 404 });
    });

    await notifyPushEvent(
      { prisma, push },
      'CONTRACT_SIGNED',
      { officeId: team.lawyer.officeId, responsibleId: team.lawyer.userId },
      { type: 'CONTRACT_SIGNED', title: 't', body: 'b' },
    );

    const remaining = (await prisma.pushSubscription.findMany()).map((row) => row.endpoint).sort();
    expect(remaining).toEqual(
      [endpoint('admin-notebook'), endpoint('lawyer-pc'), endpoint('admin-off-pc'), endpoint('assistant-pc'), endpoint('outsider-pc')].sort(),
    );
  });

  it('falha de envio não lança', async () => {
    const team = await setupOffice();
    const { push } = makePush(async () => {
      throw new Error('push service down');
    });

    await expect(
      notifyPushEvent(
        { prisma, push },
        'CONTRACT_SIGNED',
        { officeId: team.lawyer.officeId, responsibleId: team.lawyer.userId },
        { type: 'CONTRACT_SIGNED', title: 't', body: 'b' },
      ),
    ).resolves.toBeUndefined();
  });

  it('cron de renovação: alerta vai ao responsável + ADMINs e a reexecução NÃO reenvia (idempotência preservada)', async () => {
    const team = await setupOffice();
    await createFixtureContract(team.lawyer.officeId, team.lawyer.userId, { status: 'ATIVO', endDate: day(10) });
    const { push, sentEndpoints, sender } = makePush();
    const job = new ContractRenewalJobService(prisma, push);

    expect(await job.run(NOW)).toEqual({ processed: 1, notified: 1, skipped: 0 });
    expect(sentEndpoints()).toEqual(EXPECTED_ALL);

    // Notification interna: só do responsável (como antes).
    const notifications = await prisma.notification.findMany();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.userId).toBe(team.lawyer.userId);

    sender.send.mockClear();
    expect(await job.run(NOW)).toEqual({ processed: 1, notified: 0, skipped: 1 });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('aceite eletrônico: push para responsável + ADMINs depois do commit; Notification só do responsável', async () => {
    const team = await setupOffice();
    const contract = await createFixtureContract(team.lawyer.officeId, team.lawyer.userId, { status: 'ENVIADO' });
    const { push, sentEndpoints } = makePush();
    const service = new ContractSignatureService(prisma, {
      publicAppUrl: 'https://app.lexcontract.test',
      expirationHours: 72,
      push,
    });

    const link = await service.createLink({ userId: team.lawyer.userId, officeId: team.lawyer.officeId }, contract.id);
    const token = link.url.split('/assinar/')[1] as string;
    await service.sign(
      token,
      { signerName: 'Maria Fernanda Costa', signerDocument: '11144477735', consent: true },
      { ip: '203.0.113.9', userAgent: 'vitest' },
    );

    await vi.waitFor(() => expect(sentEndpoints()).toEqual(EXPECTED_ALL));
    const notifications = await prisma.notification.findMany();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.userId).toBe(team.lawyer.userId);
  });
});
