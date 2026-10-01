import type { Contract } from '../types/api';

/** Janela (em dias) do alerta/indicador de renovação — espelha o backend (RENEWAL_ALERT_WINDOW_DAYS). */
export const RENEWAL_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** startDate/endDate são datas de calendário gravadas em 00:00 UTC: formatar em UTC evita "voltar um dia" no Brasil. */
export function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/** Dias (calendário) até o término. Negativo = já venceu. */
export function daysUntilEnd(endDateIso: string, now: Date = new Date()): number {
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(endDateIso) - todayUtc) / DAY_MS);
}

export interface RenewalIndicator {
  label: string;
  tone: 'warning' | 'danger';
}

/** Indicador visual de vencimento próximo/vencido — só para contratos vigentes (ativo/assinado). */
export function renewalIndicator(contract: Pick<Contract, 'status' | 'endDate'>): RenewalIndicator | null {
  if (!contract.endDate) return null;
  if (contract.status !== 'ativo' && contract.status !== 'assinado') return null;

  const days = daysUntilEnd(contract.endDate);
  if (days < 0) return { label: 'Vencido', tone: 'danger' };
  if (days === 0) return { label: 'Vence hoje', tone: 'warning' };
  if (days <= RENEWAL_WINDOW_DAYS) return { label: `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`, tone: 'warning' };
  return null;
}

export const RENEWAL_TONE_STYLES: Record<RenewalIndicator['tone'], { backgroundColor: string; color: string }> = {
  warning: { backgroundColor: '#FFFBEB', color: '#B45309' },
  danger: { backgroundColor: '#FEF2F2', color: '#DC2626' },
};
