import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { AuditLogEntry } from '../types/api';

export interface ListAuditLogParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  entityType?: string;
  entityId?: string;
}

export const auditService = {
  list: (params: ListAuditLogParams = {}) => apiClient.get<Paginated<AuditLogEntry>>('/audit', params),
};
