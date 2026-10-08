/**
 * Adapter do WhatsApp AUTOMÁTICO (futuro). Hoje o produto usa apenas `wa.me` com mensagem
 * pré-preenchida (botão manual no frontend), que continua funcionando. Enquanto não existir um
 * provider automático, `available` é false: a preferência `whatsappEnabled` é respeitada mas o
 * sistema NÃO finge que enviou nenhuma mensagem.
 */
export interface WhatsappMessage {
  /** Telefone do destinatário (somente dígitos, com DDI). */
  to: string;
  text: string;
}

export interface WhatsappProvider {
  readonly name: string;
  readonly available: boolean;
  send(message: WhatsappMessage): Promise<{ ok: boolean }>;
}

export class NoopWhatsappProvider implements WhatsappProvider {
  readonly name = 'none';
  readonly available = false;
  async send(): Promise<{ ok: boolean }> {
    return { ok: false };
  }
}
