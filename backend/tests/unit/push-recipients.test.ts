import { describe, expect, it, vi } from 'vitest';

import {
  PUSH_RECIPIENT_POLICY,
  RULE_ADMINS,
  RULE_RESPONSIBLE,
  notifyPushEvent,
  resolvePushRecipients,
  type PushRecipientPolicy,
} from '../../src/modules/notifications/push-recipients';
import type { PushMessage, PushNotifier, PushSendResult } from '../../src/modules/notifications/push.types';
import { ALL_USERS, OFFICE, TEAM, makeFakeUserDb } from './helpers-push-recipients';

const CTX = { officeId: OFFICE, responsibleId: TEAM.lawyer!.id };
const ids = (recipients: { userId: string }[]) => recipients.map((r) => r.userId);

describe('política de destinatários (PUSH_RECIPIENT_POLICY)', () => {
  it('assinatura e renovação: responsável + ADMINs', () => {
    expect(PUSH_RECIPIENT_POLICY.CONTRACT_SIGNED).toEqual([RULE_RESPONSIBLE, RULE_ADMINS]);
    expect(PUSH_RECIPIENT_POLICY.CONTRACT_RENEWAL).toEqual([RULE_RESPONSIBLE, RULE_ADMINS]);
  });
});

describe('resolvePushRecipients', () => {
  it('o responsável recebe e os ADMINs ativos do mesmo escritório também (responsável primeiro)', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    const recipients = await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX);

    expect(ids(recipients)[0]).toBe('lawyer-1');
    expect(ids(recipients).sort()).toEqual(['admin-1', 'admin-2', 'lawyer-1']);
    expect(recipients.every((r) => r.officeId === OFFICE)).toBe(true);
  });

  it('ADMIN inativo NÃO recebe', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_RENEWAL', CTX))).not.toContain('admin-off');
  });

  it('ADMIN de OUTRO escritório NÃO recebe', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_RENEWAL', CTX))).not.toContain('admin-x');
  });

  it('ASSISTANT NÃO recebe automaticamente', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX))).not.toContain('assistant-1');
  });

  it('responsável que também é ADMIN aparece UMA vez (deduplicação por userId)', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    const recipients = await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', { officeId: OFFICE, responsibleId: 'admin-1' });

    expect(ids(recipients).filter((id) => id === 'admin-1')).toHaveLength(1);
    expect(ids(recipients).sort()).toEqual(['admin-1', 'admin-2']);
    expect(ids(recipients)[0]).toBe('admin-1');
  });

  it('responsável INATIVO não recebe, mas os ADMINs ativos sim', async () => {
    const users = ALL_USERS.map((u) => (u.id === 'lawyer-1' ? { ...u, status: 'INACTIVE' as const } : u));
    const { prisma } = makeFakeUserDb(users);
    expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX)).sort()).toEqual(['admin-1', 'admin-2']);
  });

  it('a consulta é sempre limitada ao escritório do evento e a usuários ACTIVE', async () => {
    const { prisma, findMany } = makeFakeUserDb(ALL_USERS);
    await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX);

    expect(findMany).toHaveBeenCalledTimes(1);
    const where = findMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ officeId: OFFICE, status: 'ACTIVE' });
    expect(where?.OR).toEqual([{ id: { in: ['lawyer-1'] } }, { role: { in: ['ADMIN'] } }]);
  });

  it('defesa em profundidade: mesmo que a consulta devolvesse usuários indevidos, eles são descartados', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS, { ignoreWhere: true });
    // A consulta "vazou" assistente, ADMIN inativo e ADMIN de outro escritório: o filtro em memória os remove.
    expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX)).sort()).toEqual(['admin-1', 'admin-2', 'lawyer-1']);
  });

  describe('política configurável', () => {
    const policy = (rules: PushRecipientPolicy['CONTRACT_SIGNED']): PushRecipientPolicy => ({
      CONTRACT_SIGNED: rules,
      CONTRACT_RENEWAL: rules,
    });

    it('somente o responsável', async () => {
      const { prisma } = makeFakeUserDb(ALL_USERS);
      expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX, policy([RULE_RESPONSIBLE])))).toEqual(['lawyer-1']);
    });

    it('somente ADMINs (o responsável não-ADMIN fica de fora)', async () => {
      const { prisma } = makeFakeUserDb(ALL_USERS);
      expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX, policy([RULE_ADMINS]))).sort()).toEqual(['admin-1', 'admin-2']);
    });

    it('ASSISTANT só recebe quando a política o lista explicitamente', async () => {
      const { prisma } = makeFakeUserDb(ALL_USERS);
      const withAssistants = policy([RULE_RESPONSIBLE, { kind: 'ROLE', role: 'ASSISTANT' }]);
      expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX, withAssistants)).sort()).toEqual(['assistant-1', 'lawyer-1']);
    });

    it('usuários específicos: respeitam escritório e status (id de outro escritório/inativo é ignorado)', async () => {
      const { prisma } = makeFakeUserDb(ALL_USERS);
      const specific = policy([{ kind: 'USERS', userIds: ['assistant-1', 'admin-x', 'admin-off'] }]);
      expect(ids(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX, specific))).toEqual(['assistant-1']);
    });

    it('política vazia ou sem responsável conhecido não consulta o banco nem devolve ninguém', async () => {
      const { prisma, findMany } = makeFakeUserDb(ALL_USERS);
      expect(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', CTX, policy([]))).toEqual([]);
      expect(await resolvePushRecipients(prisma, 'CONTRACT_SIGNED', { officeId: OFFICE, responsibleId: null }, policy([RULE_RESPONSIBLE]))).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});

describe('notifyPushEvent', () => {
  const MESSAGE: PushMessage = { type: 'CONTRACT_SIGNED', title: 'Contrato assinado', body: 'O contrato #1 foi assinado pelo cliente.', url: '/contratos/c-1' };

  function makePush(impl?: PushNotifier['sendToUsers']) {
    const sendToUsers = vi.fn<PushNotifier['sendToUsers']>(
      impl ?? (async (): Promise<PushSendResult> => ({ sent: 3, removed: 0, failed: 0 })),
    );
    return { sendToUser: vi.fn<PushNotifier['sendToUser']>(), sendToUsers };
  }

  it('envia UMA chamada de fan-out com os destinatários resolvidos e a mensagem intacta', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    const push = makePush();
    await notifyPushEvent({ prisma, push }, 'CONTRACT_SIGNED', CTX, MESSAGE);

    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
    const [recipients, message] = push.sendToUsers.mock.calls[0]!;
    expect(ids(recipients).sort()).toEqual(['admin-1', 'admin-2', 'lawyer-1']);
    expect(message).toEqual(MESSAGE);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('sem Web Push configurado é no-op e não consulta o banco', async () => {
    const { prisma, findMany } = makeFakeUserDb(ALL_USERS);
    await expect(notifyPushEvent({ prisma, push: undefined }, 'CONTRACT_SIGNED', CTX, MESSAGE)).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('falha no envio NÃO lança (não quebra o evento de negócio) e é logada sem dados pessoais', async () => {
    const { prisma } = makeFakeUserDb(ALL_USERS);
    const push = makePush(async () => {
      throw new Error('push down');
    });
    const warn = vi.fn();

    await expect(notifyPushEvent({ prisma, push, warn }, 'CONTRACT_SIGNED', CTX, MESSAGE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/lawyer-1|admin-1/);
  });

  it('se a consulta de destinatários falhar, ainda avisa o responsável (a política o inclui)', async () => {
    const { prisma, findMany } = makeFakeUserDb(ALL_USERS);
    findMany.mockRejectedValueOnce(new Error('db down'));
    const push = makePush();
    const warn = vi.fn();

    await notifyPushEvent({ prisma, push, warn }, 'CONTRACT_SIGNED', CTX, MESSAGE);

    expect(push.sendToUsers).toHaveBeenCalledWith([{ officeId: OFFICE, userId: 'lawyer-1' }], MESSAGE);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('se a consulta falhar e a política NÃO inclui o responsável, não envia para ninguém', async () => {
    const { prisma, findMany } = makeFakeUserDb(ALL_USERS);
    findMany.mockRejectedValueOnce(new Error('db down'));
    const push = makePush();
    const onlyAdmins: PushRecipientPolicy = { CONTRACT_SIGNED: [RULE_ADMINS], CONTRACT_RENEWAL: [RULE_ADMINS] };

    await expect(notifyPushEvent({ prisma, push, policy: onlyAdmins, warn: vi.fn() }, 'CONTRACT_SIGNED', CTX, MESSAGE)).resolves.toBeUndefined();
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });
});
