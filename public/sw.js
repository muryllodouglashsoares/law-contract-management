/*
 * Service Worker do LexContract — usado SOMENTE para Web Push.
 * Não faz cache e não intercepta requisições (não há `fetch` handler), então não afeta
 * o carregamento nem a autenticação do app. Servido em /sw.js (raiz = escopo do site).
 *
 * Payload esperado (JSON, montado pelo backend): { type, title, body, url?, tag? }.
 * O push pode aparecer na tela bloqueada: o backend só envia um resumo curto.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'LexContract';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    // Mesmo `tag` = a notificação nova substitui a anterior do mesmo assunto (sem empilhar).
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    data: { url: typeof data.url === 'string' ? data.url : '/', type: data.type },
  };

  // Navegadores exigem exibir uma notificação para cada push recebido.
  event.waitUntil(self.registration.showNotification(title, options));
});

/** Aceita apenas URLs da própria origem; qualquer outra coisa cai na página inicial. */
function resolveTarget(raw) {
  try {
    const url = new URL(raw || '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + '/';
  } catch {
    return self.location.origin + '/';
  }
}

async function openTarget(href) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    try {
      await client.focus();
      if (client.url !== href) await client.navigate(href);
      return;
    } catch {
      break; // janela não controlável: abre uma nova abaixo
    }
  }
  await self.clients.openWindow(href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = resolveTarget(event.notification.data && event.notification.data.url);
  // Sem sessão, o app (ProtectedRoute) leva ao login e volta para esta rota depois.
  event.waitUntil(openTarget(href));
});
