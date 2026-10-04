/**
 * Tipos de evento que podem gerar Web Push. Lista deliberadamente curta: só entra aqui um
 * evento que realmente dispara push (ver README → "Eventos que geram Web Push"). Nem toda
 * Notification interna vira push, para evitar excesso de avisos.
 */
export const PUSH_EVENT_TYPES = {
  /** Cliente concluiu o aceite eletrônico (ContractSignatureService.sign). */
  CONTRACT_SIGNED: 'CONTRACT_SIGNED',
  /** Contrato próximo do vencimento (job diário ContractRenewalJobService). */
  CONTRACT_RENEWAL: 'CONTRACT_RENEWAL',
  /** Push de teste enviado pelo próprio usuário aos seus dispositivos. */
  TEST: 'TEST',
} as const;
export type PushEventType = (typeof PUSH_EVENT_TYPES)[keyof typeof PUSH_EVENT_TYPES];

/**
 * Conteúdo de um push. O push pode aparecer na tela bloqueada do dispositivo: só um
 * resumo curto, sem nome de cliente, valores, trechos de contrato ou qualquer dado sensível.
 */
export interface PushMessage {
  type: PushEventType;
  title: string;
  body: string;
  /** Caminho interno do frontend aberto ao clicar (ex.: `/contratos/<id>`). Sempre começa com `/`. */
  url?: string;
  /** Agrupa/substitui pushes repetidos do mesmo assunto no dispositivo. */
  tag?: string;
}

export interface PushRecipient {
  officeId: string;
  userId: string;
}

export interface PushSendResult {
  sent: number;
  /** Subscriptions inválidas (404/410) removidas do banco. */
  removed: number;
  failed: number;
}

/**
 * Contrato usado pelos módulos de negócio (contratos, assinatura, cron). Quem chama não
 * conhece a biblioteca `web-push`. Implementações NUNCA lançam: um push que falha não pode
 * desfazer nem quebrar o evento de negócio que o originou.
 */
export interface PushNotifier {
  sendToUser(recipient: PushRecipient, message: PushMessage): Promise<PushSendResult>;
  /**
   * Fan-out para vários usuários (mesma mensagem). Deduplica por `officeId + userId`, envia a TODOS
   * os dispositivos de cada um e remove subscriptions 404/410. Quem decide QUEM recebe é a política
   * central em `push-recipients.ts` — o notifier só entrega.
   */
  sendToUsers(recipients: PushRecipient[], message: PushMessage): Promise<PushSendResult>;
}

export interface PushSubscriptionTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Fronteira com a biblioteca `web-push` (substituída por um fake nos testes unitários). */
export interface WebPushSender {
  send(target: PushSubscriptionTarget, payload: string): Promise<void>;
}
