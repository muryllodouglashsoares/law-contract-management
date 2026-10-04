import { onNotificationsChanged } from '../lib/notifications-events';
import { notificationsService } from './notifications';

/**
 * Reproduz o bug: menu mostrava 2, página mostrava 1. Um "backend" falso mantém as notificações
 * (com paginação) e responde como a API real: { data, pagination, unreadCount } — unreadCount é
 * sempre o total real de não lidas, não o tamanho da página.
 */
function installFakeBackend(initial: { id: string; read: boolean }[]) {
  const store = initial.map((n) => ({ ...n }));
  const requests: string[] = [];
  const unread = () => store.filter((n) => !n.read).length;

  const json = (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  (globalThis as { fetch: unknown }).fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.pathname}${url.search}`);

    if (method === 'GET' && url.pathname === '/notifications') {
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      const onlyUnread = url.searchParams.get('read') === 'false';
      const rows = (onlyUnread ? store.filter((n) => !n.read) : store).slice(0, pageSize);
      return json(200, { data: rows, pagination: { page: 1, pageSize, total: store.length }, unreadCount: unread() });
    }
    if (method === 'PATCH' && url.pathname === '/notifications/read-all') {
      store.forEach((n) => (n.read = true));
      return json(204, null);
    }
    const one = url.pathname.match(/^\/notifications\/(.+)\/read$/);
    if (method === 'PATCH' && one) {
      const found = store.find((n) => n.id === one[1]);
      if (found) found.read = true;
      return json(200, { notification: found });
    }
    return json(404, { error: { message: 'not found' } });
  };
  return { store, requests };
}

function installBrowserGlobals() {
  const windowTarget = new EventTarget();
  (globalThis as { window: unknown }).window = windowTarget;
  (globalThis as { localStorage: unknown }).localStorage = { getItem: () => 'token', setItem: () => undefined, removeItem: () => undefined };
  return windowTarget;
}

/** Equivalente ao AppLayout: consulta inicial + refaz a consulta a cada `notifications:changed`. */
async function mountMenu() {
  const menu = { unreadCount: -1, refetches: 0 };
  const load = async () => {
    menu.unreadCount = (await notificationsService.list({ pageSize: 1, read: false })).unreadCount;
    menu.refetches += 1;
  };
  await load();
  const off = onNotificationsChanged(() => void load());
  return { menu, load, off };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('contador de notificações (menu x página)', () => {
  it('marcar UMA como lida atualiza o contador do menu sem recarregar a página', async () => {
    installBrowserGlobals();
    installFakeBackend([{ id: 'a', read: false }, { id: 'b', read: false }, { id: 'c', read: true }]);
    const { menu, off } = await mountMenu();

    expect(menu.unreadCount).toBe(2); // Menu: 2

    await notificationsService.markRead('a');
    await settle();

    expect(menu.unreadCount).toBe(1); // Menu: 1
    off();
  });

  it('marcar TODAS como lidas zera o contador do menu', async () => {
    installBrowserGlobals();
    installFakeBackend([{ id: 'a', read: false }, { id: 'b', read: false }]);
    const { menu, off } = await mountMenu();
    expect(menu.unreadCount).toBe(2);

    await notificationsService.markAllRead();
    await settle();

    expect(menu.unreadCount).toBe(0);
    off();
  });

  it('o unreadCount do backend é respeitado mesmo com mais notificações que o pageSize', async () => {
    installBrowserGlobals();
    installFakeBackend(Array.from({ length: 120 }, (_, i) => ({ id: `n${i}`, read: false })));

    const page = await notificationsService.list({ pageSize: 50 });
    expect(page.data).toHaveLength(50);
    // O cabeçalho da página usa isto (data.unreadCount), não data.filter(!read).length.
    expect(page.unreadCount).toBe(120);
  });

  it('o evento só dispara depois do sucesso: se a API falhar, o contador não é refeito', async () => {
    installBrowserGlobals();
    const { store } = installFakeBackend([{ id: 'a', read: false }]);
    const { menu, off } = await mountMenu();
    const before = menu.refetches;

    (globalThis as { fetch: unknown }).fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'erro' } }), { status: 500, headers: { 'content-type': 'application/json' } });
    await notificationsService.markRead('a').catch(() => undefined);
    await settle();

    expect(menu.refetches).toBe(before);
    expect(store[0]?.read).toBe(false);
    off();
  });

  it('o evento é local: marcar como lida não cria notificação nem contador extra (só PATCH + GET de leitura)', async () => {
    installBrowserGlobals();
    const { requests } = installFakeBackend([{ id: 'a', read: false }]);
    const { off } = await mountMenu();
    await notificationsService.markRead('a');
    await settle();

    expect(requests.filter((r) => r.startsWith('POST'))).toHaveLength(0);
    expect(requests).toContain('PATCH /notifications/a/read');
    off();
  });
});
