import type { UserRole, UserStatus } from '../types/api';

/** Rótulos amigáveis. Os valores enviados/recebidos da API continuam sendo os do enum. */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  LAWYER: 'Advogado(a)',
  ASSISTANT: 'Assistente',
};

export const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'LAWYER', 'ASSISTANT'];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
};
