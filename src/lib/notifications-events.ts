/**
 * Sincronização do contador de notificações sem biblioteca de estado global: quem altera
 * notificações (marcar uma/todas como lida) dispara este evento; o AppLayout escuta e refaz a
 * consulta de `unreadCount` (o backend é a fonte da verdade).
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'notifications:changed';

export function notifyNotificationsChanged(target: EventTarget = window): void {
  target.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

/** Registra um ouvinte; devolve a função que o remove (use no cleanup do useEffect). */
export function onNotificationsChanged(handler: () => void, target: EventTarget = window): () => void {
  target.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
  return () => target.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
}
