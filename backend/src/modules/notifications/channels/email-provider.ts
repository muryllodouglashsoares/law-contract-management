/**
 * Camada de abstração de e-mail. Nenhum serviço pago é obrigatório: com o provider `none`
 * (padrão) o sistema funciona normalmente e simplesmente não envia e-mails.
 */

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  /** Corpo em texto puro (sempre presente). */
  text: string;
  /** Rótulo e URL do botão principal (ex.: "Assinar contrato"). */
  action?: { label: string; url: string };
}

export type EmailSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; errorCode: string; errorMessage: string };

export interface EmailProvider {
  /** Nome gravado em EmailDelivery.provider. */
  readonly name: string;
  /** false = envio indisponível (provider none/desabilitado): o chamador nem tenta enviar. */
  readonly available: boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Provider desligado: sistema segue funcionando sem e-mail automático. */
export class NoopEmailProvider implements EmailProvider {
  readonly name = 'none';
  readonly available = false;
  async send(): Promise<EmailSendResult> {
    return { ok: false, errorCode: 'EMAIL_UNAVAILABLE', errorMessage: 'Envio de e-mail não está configurado.' };
  }
}

/** Desenvolvimento: NÃO envia nada; registra apenas que enviaria (sem destinatário, corpo ou link). */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  readonly available = true;
  constructor(private readonly log: (message: string) => void = (m) => console.info(m)) {}
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.log(`[email:log] e-mail simulado (assunto: "${message.subject}")`);
    return { ok: true, providerMessageId: 'log' };
  }
}

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  /** Chave privada (accessToken) — somente no backend. */
  privateKey: string;
  endpoint?: string;
  timeoutMs?: number;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * EmailJS via API REST (https://www.emailjs.com/docs/rest-api/send/). Exige, no painel do EmailJS,
 * habilitar "Allow EmailJS API for non-browser applications". O template deve usar as variáveis
 * {{to_email}}, {{to_name}}, {{subject}}, {{message}}, {{action_label}} e {{action_url}}.
 */
export class EmailJsProvider implements EmailProvider {
  readonly name = 'emailjs';
  readonly available = true;

  constructor(
    private readonly config: EmailJsConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    try {
      const response = await this.fetchImpl(this.config.endpoint ?? 'https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          service_id: this.config.serviceId,
          template_id: this.config.templateId,
          user_id: this.config.publicKey,
          accessToken: this.config.privateKey,
          template_params: {
            to_email: message.to,
            to_name: message.toName ?? '',
            subject: message.subject,
            message: message.text,
            action_label: message.action?.label ?? '',
            action_url: message.action?.url ?? '',
          },
        }),
      });
      if (!response.ok) {
        // O corpo de erro do EmailJS pode ecoar parâmetros: guardamos só o status HTTP.
        return { ok: false, errorCode: `EMAILJS_HTTP_${response.status}`, errorMessage: `O provedor de e-mail recusou o envio (HTTP ${response.status}).` };
      }
      return { ok: true };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        errorCode: aborted ? 'EMAIL_TIMEOUT' : 'EMAIL_NETWORK_ERROR',
        errorMessage: aborted ? 'Tempo esgotado ao contatar o provedor de e-mail.' : 'Falha de rede ao contatar o provedor de e-mail.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface EmailProviderEnv {
  EMAIL_ENABLED: boolean;
  EMAIL_PROVIDER: 'none' | 'log' | 'emailjs';
  EMAILJS_SERVICE_ID?: string;
  EMAILJS_TEMPLATE_ID?: string;
  EMAILJS_PUBLIC_KEY?: string;
  EMAILJS_PRIVATE_KEY?: string;
}

export function createEmailProvider(config: EmailProviderEnv): EmailProvider {
  if (!config.EMAIL_ENABLED || config.EMAIL_PROVIDER === 'none') return new NoopEmailProvider();
  if (config.EMAIL_PROVIDER === 'log') return new LogEmailProvider();
  if (config.EMAIL_PROVIDER === 'emailjs') {
    const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = config;
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) return new NoopEmailProvider();
    return new EmailJsProvider({
      serviceId: EMAILJS_SERVICE_ID,
      templateId: EMAILJS_TEMPLATE_ID,
      publicKey: EMAILJS_PUBLIC_KEY,
      privateKey: EMAILJS_PRIVATE_KEY,
    });
  }
  return new NoopEmailProvider();
}
