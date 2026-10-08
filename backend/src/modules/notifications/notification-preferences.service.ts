import type { PrismaClient, UserNotificationPreference } from '@prisma/client';

export interface NotificationPreferences {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
}

/** Padrões usados quando o usuário ainda não salvou nenhuma preferência (sem linha no banco). */
export const DEFAULT_NOTIFICATION_PREFERENCES: Readonly<NotificationPreferences> = {
  emailEnabled: true,
  whatsappEnabled: false,
  pushEnabled: true,
};

export function toPreferences(row: Pick<UserNotificationPreference, 'emailEnabled' | 'whatsappEnabled' | 'pushEnabled'> | null): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return { emailEnabled: row.emailEnabled, whatsappEnabled: row.whatsappEnabled, pushEnabled: row.pushEnabled };
}

type PreferencePrisma = Pick<PrismaClient, 'userNotificationPreference'>;

/**
 * Preferências de notificação do USUÁRIO autenticado. O backend é a fonte da verdade: os canais
 * (e-mail, WhatsApp automático e push) consultam estas preferências antes de disparar.
 */
export class NotificationPreferenceService {
  constructor(private readonly prisma: PreferencePrisma) {}

  async get(userId: string): Promise<NotificationPreferences> {
    const row = await this.prisma.userNotificationPreference.findUnique({ where: { userId } });
    return toPreferences(row);
  }

  /** PATCH parcial e atômico (upsert): só os campos informados mudam. */
  async update(userId: string, patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const row = await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_NOTIFICATION_PREFERENCES, ...patch },
      update: patch,
    });
    return toPreferences(row);
  }

  /** Preferências de vários usuários em UMA consulta (usuários sem linha recebem os padrões). */
  async getMany(userIds: string[]): Promise<Map<string, NotificationPreferences>> {
    const result = new Map<string, NotificationPreferences>();
    for (const id of userIds) result.set(id, { ...DEFAULT_NOTIFICATION_PREFERENCES });
    if (userIds.length === 0) return result;
    const rows = await this.prisma.userNotificationPreference.findMany({ where: { userId: { in: userIds } } });
    for (const row of rows) result.set(row.userId, toPreferences(row));
    return result;
  }
}
