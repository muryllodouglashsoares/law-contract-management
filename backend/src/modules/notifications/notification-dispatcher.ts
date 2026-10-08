import type { PrismaClient } from '@prisma/client';

import type { WhatsappProvider } from './channels/whatsapp-provider';
import type { EmailService } from './email.service';
import type { NotificationPreferenceService } from './notification-preferences.service';
import { notifyPushEvent, type PolicyPushEvent, type PushEventContext } from './push-recipients';
import type { PushMessage, PushNotifier } from './push.types';

/**
 * Despacho dos canais EXTERNOS (Web Push, e-mail, WhatsApp automático) a partir de um evento de
 * negócio. A notificação in-app (Notification) continua sendo criada na transação do evento
 * (createNotification); este dispatcher roda DEPOIS do commit e nunca lança.
 *
 *   evento de negócio ─► NotificationDispatcher ─┬─ web-push (política central + pushEnabled)
 *                                                ├─ e-mail   (emailEnabled + provider configurado)
 *                                                └─ whatsapp (whatsappEnabled + provider; hoje: adapter vazio)
 *
 * Os services de contrato/pagamento NÃO chamam EmailJS/WhatsApp diretamente.
 */
export interface DispatchEvent {
  officeId: string;
  /** Evento de push (define destinatários pela política central). */
  pushEvent: PolicyPushEvent;
  /** Responsável do evento (alvo da regra RESPONSIBLE). */
  responsibleId: string | null;
  push: PushMessage;
  /** Quando presente, também avisa por e-mail os usuários listados (ex.: o responsável). */
  email?: { subject: string; text: string; userIds: string[]; contractId?: string };
  /** Reservado: usado quando existir provider automático de WhatsApp. */
  whatsapp?: { text: string; userIds: string[] };
}

type DispatcherPrisma = Pick<PrismaClient, 'user'>;

export class NotificationDispatcher {
  constructor(
    private readonly deps: {
      prisma: DispatcherPrisma;
      push?: PushNotifier;
      email?: EmailService;
      preferences?: NotificationPreferenceService;
      whatsapp?: WhatsappProvider;
      warn?: (message: string, meta?: Record<string, unknown>) => void;
    },
  ) {}

  async dispatch(event: DispatchEvent): Promise<void> {
    const context: PushEventContext = { officeId: event.officeId, responsibleId: event.responsibleId };
    await Promise.all([
      notifyPushEvent({ prisma: this.deps.prisma, push: this.deps.push, warn: this.deps.warn }, event.pushEvent, context, event.push),
      this.sendEmails(event),
      this.sendWhatsapp(event),
    ]);
  }

  private async sendEmails(event: DispatchEvent): Promise<void> {
    const { email } = this.deps;
    if (!event.email || !email || !email.available) return;
    try {
      const ids = [...new Set(event.email.userIds)];
      if (ids.length === 0) return;
      const preferences = this.deps.preferences ? await this.deps.preferences.getMany(ids) : null;
      const users = await this.deps.prisma.user.findMany({
        where: { id: { in: ids }, officeId: event.officeId, status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
      });
      for (const user of users) {
        if (preferences && preferences.get(user.id)?.emailEnabled === false) continue;
        await email.send({
          officeId: event.officeId,
          type: 'NOTIFICATION',
          contractId: event.email.contractId ?? null,
          message: { to: user.email, toName: user.name, subject: event.email.subject, text: event.email.text },
        });
      }
    } catch (error) {
      (this.deps.warn ?? console.warn)('[notify] falha ao enviar e-mails', { reason: error instanceof Error ? error.message : 'unknown' });
    }
  }

  private async sendWhatsapp(event: DispatchEvent): Promise<void> {
    const provider = this.deps.whatsapp;
    // Sem provider automático: nada é enviado (e nada é simulado). O botão manual (wa.me) segue no frontend.
    if (!event.whatsapp || !provider || !provider.available) return;
    try {
      const ids = [...new Set(event.whatsapp.userIds)];
      const preferences = this.deps.preferences ? await this.deps.preferences.getMany(ids) : null;
      const users = await this.deps.prisma.user.findMany({
        where: { id: { in: ids }, officeId: event.officeId, status: 'ACTIVE' },
        select: { id: true, phone: true },
      });
      for (const user of users) {
        if (!user.phone || preferences?.get(user.id)?.whatsappEnabled !== true) continue;
        await provider.send({ to: user.phone.replace(/\D/g, ''), text: event.whatsapp.text });
      }
    } catch (error) {
      (this.deps.warn ?? console.warn)('[notify] falha ao enviar WhatsApp', { reason: error instanceof Error ? error.message : 'unknown' });
    }
  }
}
