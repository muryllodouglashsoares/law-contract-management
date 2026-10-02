/**
 * Web Push no navegador: Service Worker + PushManager + permissão de notificação.
 *
 * Regra de ouro: "subscription existe NESTE navegador" = "notificações ativas neste
 * dispositivo". O backend é a fonte de verdade de quem recebe; aqui só criamos/removemos a
 * subscription e a sincronizamos com o servidor.
 */
import { pushService, type PushSubscriptionPayload } from '../services/push';

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;
const STORAGE_KEY = 'lexcontract:push';

/** Guardamos QUEM ativou neste navegador: evita ligar o push do usuário A ao usuário B em um
 * computador compartilhado, e permite remover a subscription no servidor ao sair (logout). */
interface StoredPush {
  userId: string;
  endpoint: string;
}

function readStored(): StoredPush | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPush) : null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredPush | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* armazenamento indisponível: o recurso continua funcionando, só sem a sincronização extra */
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type PushPermission = NotificationPermission | 'unsupported';

export function getPermission(): PushPermission {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

/** A chave VAPID pública vem em base64url; o PushManager exige bytes. */
function urlBase64ToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === expected.length && a.every((value, index) => value === expected[index]);
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Subscription inválida retornada pelo navegador.');
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Subscription deste navegador, sem criar nada (null se o Service Worker nunca foi registrado). */
export async function getBrowserSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return registration ? registration.pushManager.getSubscription() : null;
}

/** true se ESTE navegador tem Web Push ativo para o usuário informado. */
export async function isEnabledForUser(userId: string): Promise<boolean> {
  if (getPermission() !== 'granted') return false;
  const stored = readStored();
  if (!stored || stored.userId !== userId) return false;
  return (await getBrowserSubscription()) !== null;
}

export class PushPermissionDeniedError extends Error {
  constructor() {
    super('Permissão de notificações negada.');
    this.name = 'PushPermissionDeniedError';
  }
}

/**
 * Ativa o Web Push neste dispositivo. Chamar SOMENTE a partir de um clique do usuário:
 * é aqui que o navegador pergunta a permissão.
 */
export async function enablePush(userId: string, vapidPublicKey: string): Promise<void> {
  if (!isPushSupported()) throw new Error('Este navegador não suporta notificações push.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionDeniedError();

  await navigator.serviceWorker.register(SW_URL, { scope: import.meta.env.BASE_URL });
  const registration = await navigator.serviceWorker.ready;

  const applicationServerKey = urlBase64ToBytes(vapidPublicKey);
  let subscription = await registration.pushManager.getSubscription();

  // Subscription criada com outra chave VAPID (chaves rotacionadas) não serve mais: recria.
  if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

  const payload = toPayload(subscription);
  await pushService.subscribe(payload);
  writeStored({ userId, endpoint: payload.endpoint });
}

/** Desativa o Web Push neste dispositivo: remove do servidor e do navegador. */
export async function disablePush(): Promise<void> {
  const subscription = await getBrowserSubscription();
  if (subscription) {
    try {
      await pushService.unsubscribe(subscription.endpoint);
    } catch {
      // Se o servidor estiver fora do ar, ainda desligamos aqui; o servidor remove a
      // subscription sozinho na primeira tentativa de envio que o navegador rejeitar (410).
    }
    await subscription.unsubscribe();
  }
  writeStored(null);
}

/**
 * Chamado ao entrar no app: se este navegador já foi ativado POR ESTE usuário, garante que o
 * servidor conhece a subscription (ela é removida no logout e pode ter sido limpa por erro).
 */
export async function syncPush(userId: string): Promise<void> {
  try {
    if (!(await isEnabledForUser(userId))) return;
    const subscription = await getBrowserSubscription();
    if (subscription) await pushService.subscribe(toPayload(subscription));
  } catch {
    /* sincronização é best-effort; o usuário pode reativar em Configurações */
  }
}

/**
 * Chamado no logout, ANTES de limpar o token: remove esta subscription do servidor para que o
 * próximo usuário deste computador não veja as notificações de quem saiu. A subscription do
 * navegador é mantida: ao entrar de novo, o mesmo usuário é re-sincronizado por `syncPush`.
 */
export function detachPushOnLogout(): void {
  const stored = readStored();
  if (!stored) return;
  // A requisição lê o JWT de forma síncrona ao ser disparada (antes do token ser apagado).
  void pushService.unsubscribe(stored.endpoint).catch(() => undefined);
}
