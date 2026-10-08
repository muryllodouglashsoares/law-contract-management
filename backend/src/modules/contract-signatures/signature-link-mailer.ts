import type { EmailService } from '../notifications/email.service';
import type { NotificationPreferenceService } from '../notifications/notification-preferences.service';

export type SignatureEmailStatus = 'sent' | 'failed' | 'unavailable' | 'disabled_by_preference';

export interface SignatureLinkMailInput {
  officeId: string;
  /** Usuário que está gerando o link: sua preferência `emailEnabled` controla o envio. */
  senderUserId: string;
  contractId: string;
  contractNumber: number;
  officeName: string;
  client: { name: string; email: string };
  /** Link completo com o token. Usado só para montar o e-mail — nunca é persistido nem logado. */
  url: string;
  expiresAt: Date;
}

export interface SignatureLinkMailer {
  send(input: SignatureLinkMailInput): Promise<SignatureEmailStatus>;
}

function formatExpiry(date: Date): string {
  return `${date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function buildSignatureEmail(input: SignatureLinkMailInput) {
  const subject = `Contrato #${input.contractNumber} aguardando o seu aceite — ${input.officeName}`;
  const text = [
    `Olá, ${input.client.name}.`,
    '',
    `${input.officeName} enviou o contrato #${input.contractNumber} para o seu aceite eletrônico.`,
    'Clique no botão/link para ler o contrato e registrar o aceite. O link é pessoal, de uso único e válido até ' +
      `${formatExpiry(input.expiresAt)} (horário de Brasília).`,
    '',
    'Se você não esperava esta mensagem, ignore-a: nada será assinado sem a sua confirmação.',
  ].join('\n');
  return { subject, text, action: { label: 'Ler e assinar o contrato', url: input.url } };
}

/**
 * Envio do e-mail com o link de assinatura ao cliente. Falha de e-mail NUNCA impede a criação do
 * link (o chamador trata o retorno). O link só existe no e-mail; EmailDelivery guarda apenas o
 * resultado (sem corpo e sem link).
 */
export function createSignatureLinkMailer(
  email: EmailService,
  preferences: NotificationPreferenceService,
): SignatureLinkMailer {
  return {
    async send(input) {
      if (!email.available) return 'unavailable';

      const prefs = await preferences.get(input.senderUserId);
      if (!prefs.emailEnabled) return 'disabled_by_preference';

      const content = buildSignatureEmail(input);
      const outcome = await email.send({
        officeId: input.officeId,
        type: 'SIGNATURE_LINK',
        contractId: input.contractId,
        createdById: input.senderUserId,
        message: { to: input.client.email, toName: input.client.name, ...content },
      });
      return outcome.status === 'sent' ? 'sent' : outcome.status === 'failed' ? 'failed' : 'unavailable';
    },
  };
}
