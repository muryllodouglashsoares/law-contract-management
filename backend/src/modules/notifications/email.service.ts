import type { EmailDeliveryType, PrismaClient } from '@prisma/client';

import { ValidationError } from '../../shared/errors';
import type { EmailMessage, EmailProvider } from './channels/email-provider';

export type EmailOutcome =
  | { status: 'sent'; deliveryId: string | null }
  | { status: 'failed'; deliveryId: string | null; errorCode: string }
  /** Provider none/desabilitado: nada foi enviado nem registrado. */
  | { status: 'unavailable' };

export interface SendEmailInput {
  officeId: string;
  type: EmailDeliveryType;
  message: EmailMessage;
  createdById?: string | null;
  contractId?: string | null;
}

type EmailPrisma = Pick<PrismaClient, 'emailDelivery'>;

/** Remove URLs e sequências longas parecidas com tokens de qualquer texto de erro antes de gravar. */
export function sanitizeEmailError(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 300);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Envio de e-mail + registro em EmailDelivery. Nunca lança por falha de envio: o chamador (criação
 * do link, jobs) não pode ser bloqueado por e-mail. O corpo e o link NÃO são persistidos.
 */
export class EmailService {
  constructor(
    private readonly prisma: EmailPrisma,
    private readonly provider: EmailProvider,
    private readonly warn: (message: string) => void = (m) => console.warn(m),
  ) {}

  get available(): boolean {
    return this.provider.available;
  }

  async send(input: SendEmailInput): Promise<EmailOutcome> {
    if (!this.provider.available) return { status: 'unavailable' };
    if (!EMAIL_RE.test(input.message.to)) throw new ValidationError('O destinatário não possui um e-mail válido');

    const base = {
      officeId: input.officeId,
      createdById: input.createdById ?? null,
      contractId: input.contractId ?? null,
      recipient: input.message.to,
      type: input.type,
      provider: this.provider.name,
    };

    let result;
    try {
      result = await this.provider.send(input.message);
    } catch (error) {
      result = { ok: false as const, errorCode: 'EMAIL_PROVIDER_ERROR', errorMessage: error instanceof Error ? error.message : 'erro' };
    }

    try {
      if (result.ok) {
        const row = await this.prisma.emailDelivery.create({
          data: { ...base, status: 'SENT', providerMessageId: result.providerMessageId ?? null, sentAt: new Date() },
        });
        return { status: 'sent', deliveryId: row.id };
      }
      const row = await this.prisma.emailDelivery.create({
        data: { ...base, status: 'FAILED', errorCode: result.errorCode, errorMessage: sanitizeEmailError(result.errorMessage) },
      });
      return { status: 'failed', deliveryId: row.id, errorCode: result.errorCode };
    } catch {
      // Falha ao registrar a entrega não pode derrubar o fluxo de negócio.
      this.warn('[email] não foi possível registrar a entrega');
      return result.ok ? { status: 'sent', deliveryId: null } : { status: 'failed', deliveryId: null, errorCode: result.errorCode };
    }
  }
}
