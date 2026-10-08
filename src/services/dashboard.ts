import { apiClient, type QueryParams } from '../lib/api-client';
import type { DashboardSummary, ReceivablePeriod, ReceivablesReport } from '../types/api';

export interface ReceivablesParams extends QueryParams {
  period: ReceivablePeriod;
  /** YYYY-MM-DD; apenas com period=custom. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const dashboardService = {
  summary: () => apiClient.get<DashboardSummary>('/dashboard/summary'),
  /** Todos os números são calculados no backend (centavos exatos, sempre pelo escritório da sessão). */
  receivables: (params: ReceivablesParams) => apiClient.get<ReceivablesReport>('/dashboard/receivables', params),
  /** CSV gerado pelo backend (UTF-8 com BOM, separador `;`). */
  async exportReceivables(params: Pick<ReceivablesParams, 'period' | 'from' | 'to'> & { scope?: 'all' | 'overdue' }): Promise<void> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, String(value));
    const { blob, fileName } = await apiClient.downloadBlob(`/dashboard/receivables/export?${query.toString()}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName ?? 'recebiveis.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
