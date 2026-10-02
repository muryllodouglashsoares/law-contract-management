import { describe, expect, it, vi } from 'vitest';

import { PushService, isAllowedPushEndpoint } from '../../src/modules/notifications/push.service';
import { PUSH_EVENT_TYPES, type WebPushSender } from '../../src/modules/notifications/push.types';

const ACTOR = { officeId: 'office-1', userId: 'user-1' };
const MESSAGE = { type: PUSH_EVENT_TYPES.CONTRACT_SIGNED, title: 'Contrato assinado', body: 'O contrato #102 foi assinado.', url: '/contratos/c-1' };

function sub(id: string) {
  return { id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'p', auth: 'a' };
}

function makeService(opts: { subs?: ReturnType<typeof sub>[]; sender?: WebPushSender | null } = {}) {
  const findMany = vi.fn().mockResolvedValue(opts.subs ?? []);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const upsert = vi.fn().mockResolvedValue({});
  const count = vi.fn().mockResolvedValue(2);
  const warn = vi.fn();
  const prisma = { pushSubscription: { findMany, deleteMany, upsert, count } } as unknown as ConstructorParameters<typeof PushService>[0];
  const sender = opts.sender === undefined ? { send: vi.fn().mockResolvedValue(undefined) } : opts.sender;
  const service = new PushService(prisma, sender, sender ? 'PUBLIC_KEY' : null, { warn });
  return { service, findMany, deleteMany, upsert, count, warn, sender };
}

describe('PushService.sendToUser', () => {
  it('envia a TODAS as subscriptions do usuário (vários dispositivos) e filtra por escritório/usuário ativo', async () => {
    const { service, findMany, sender } = makeService({ subs: [sub('a'), sub('b')] });
    const result = await service.sendToUser(ACTOR, MESSAGE);

    expect(result).toEqual({ sent: 2, removed: 0, failed: 0 });
    expect((sender as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      userId: 'user-1',
      officeId: 'office-1',
      user: { status: 'ACTIVE' },
    });
  });

  it('monta o payload apenas com type/title/body/url/tag', async () => {
    const { service, sender } = makeService({ subs: [sub('a')] });
    await service.sendToUser(ACTOR, { ...MESSAGE, tag: 'signed:c-1' });

    const payload = JSON.parse((sender as { send: ReturnType<typeof vi.fn> }).send.mock.calls[0]?.[1]);
    expect(payload).toEqual({
      type: 'CONTRACT_SIGNED',
      title: 'Contrato assinado',
      body: 'O contrato #102 foi assinado.',
      url: '/contratos/c-1',
      tag: 'signed:c-1',
    });
  });

  it('descarta urls que não sejam caminho interno (open redirect)', async () => {
    for (const url of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'contratos/1']) {
      const { service, sender } = makeService({ subs: [sub('a')] });
      await service.sendToUser(ACTOR, { ...MESSAGE, url });
      const payload = JSON.parse((sender as { send: ReturnType<typeof vi.fn> }).send.mock.calls[0]?.[1]);
      expect(payload.url).toBeUndefined();
    }
  });

  it('remove do banco apenas as subscriptions inválidas (404/410) e mantém as demais', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }))
      .mockResolvedValueOnce(undefined);
    const { service, deleteMany } = makeService({ subs: [sub('a'), sub('b'), sub('c')], sender: { send } });

    const result = await service.sendToUser(ACTOR, MESSAGE);

    expect(result).toEqual({ sent: 1, removed: 2, failed: 0 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0]?.[0].where.id.in).toEqual(['a', 'b']);
  });

  it('erro transitório (ex.: 500) conta como falha, NÃO remove a subscription e não loga o endpoint', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    const { service, deleteMany, warn } = makeService({ subs: [sub('a')], sender: { send } });

    const result = await service.sendToUser(ACTOR, MESSAGE);

    expect(result).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('fcm.googleapis.com');
  });

  it('nunca lança, mesmo se o banco falhar', async () => {
    const { service, findMany } = makeService({ subs: [sub('a')] });
    findMany.mockRejectedValue(new Error('db down'));
    await expect(service.sendToUser(ACTOR, MESSAGE)).resolves.toEqual({ sent: 0, removed: 0, failed: 0 });
  });

  it('é no-op quando o Web Push está desativado (sem VAPID)', async () => {
    const { service, findMany } = makeService({ sender: null });
    await expect(service.sendToUser(ACTOR, MESSAGE)).resolves.toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('PushService — gerenciamento', () => {
  const input = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p', auth: 'a' };

  it('subscribe grava a subscription para o usuário autenticado (upsert por endpoint)', async () => {
    const { service, upsert } = makeService();
    await service.subscribe(ACTOR, input);

    const call = upsert.mock.calls[0]?.[0];
    expect(call.where).toEqual({ endpoint: input.endpoint });
    expect(call.create).toMatchObject({ officeId: 'office-1', userId: 'user-1', endpoint: input.endpoint });
    expect(call.update).toMatchObject({ officeId: 'office-1', userId: 'user-1' });
  });

  it('subscribe recusa quando o Web Push não está configurado', async () => {
    const { service, upsert } = makeService({ sender: null });
    await expect(service.subscribe(ACTOR, input)).rejects.toMatchObject({ statusCode: 409 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('unsubscribe só remove a subscription do próprio usuário/escritório', async () => {
    const { service, deleteMany } = makeService();
    await service.unsubscribe(ACTOR, input.endpoint);
    expect(deleteMany.mock.calls[0]?.[0].where).toEqual({
      endpoint: input.endpoint,
      userId: 'user-1',
      officeId: 'office-1',
    });
  });

  it('status expõe a chave pública (nunca a privada) e a contagem de dispositivos', async () => {
    const { service } = makeService();
    await expect(service.status(ACTOR)).resolves.toEqual({
      configured: true,
      publicKey: 'PUBLIC_KEY',
      subscriptionCount: 2,
    });
  });

  it('status com Web Push desativado não devolve chave', async () => {
    const { service } = makeService({ sender: null });
    await expect(service.status(ACTOR)).resolves.toMatchObject({ configured: false, publicKey: null });
  });

  it('sendTest envia só ao próprio usuário', async () => {
    const { service, findMany } = makeService({ subs: [sub('a')] });
    const result = await service.sendTest(ACTOR);
    expect(result.sent).toBe(1);
    expect(findMany.mock.calls[0]?.[0].where.userId).toBe('user-1');
  });
});

describe('isAllowedPushEndpoint (anti-SSRF)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('aceita %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://notfcm.googleapis.com.attacker.io/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'not a url',
  ])('rejeita %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});
