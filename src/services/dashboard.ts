import { apiClient } from '../lib/api-client';
import type { DashboardSummary } from '../types/api';

export const dashboardService = {
  summary: () => apiClient.get<DashboardSummary>('/dashboard/summary'),
};
