import { env } from '../../config/env';
import { prisma } from '../../shared/database/prisma';
import { createEmailProvider } from './channels/email-provider';
import { NoopWhatsappProvider } from './channels/whatsapp-provider';
import { EmailService } from './email.service';
import { NotificationDispatcher } from './notification-dispatcher';
import { NotificationPreferenceService } from './notification-preferences.service';
import { pushService } from './push.instance';

/** Instâncias únicas da camada de canais (in-app é criado na transação do evento). */
export const emailProvider = createEmailProvider(env);
export const emailService = new EmailService(prisma, emailProvider);
export const notificationPreferenceService = new NotificationPreferenceService(prisma);
export const whatsappProvider = new NoopWhatsappProvider();

export const notificationDispatcher = new NotificationDispatcher({
  prisma,
  push: pushService,
  email: emailService,
  preferences: notificationPreferenceService,
  whatsapp: whatsappProvider,
});
