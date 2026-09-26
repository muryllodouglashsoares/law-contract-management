import { apiClient, type Paginated, type QueryParams } from '../lib/api-client';
import type { AppDocument, DocumentCategoryApi } from '../types/api';

export interface ListDocumentsParams extends QueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: DocumentCategoryApi;
  contractId?: string;
  clientId?: string;
}

export const documentsService = {
  list: (params: ListDocumentsParams = {}) => apiClient.get<Paginated<AppDocument>>('/documents', params),
  getById: (id: string) => apiClient.get<{ document: AppDocument }>(`/documents/${id}`),
  upload: (input: { contractId: string; category?: DocumentCategoryApi; file: File }) => {
    const formData = new FormData();
    formData.append('contractId', input.contractId);
    if (input.category) formData.append('category', input.category);
    formData.append('file', input.file);
    return apiClient.upload<{ document: AppDocument }>('/documents', formData);
  },
  remove: (id: string) => apiClient.delete<void>(`/documents/${id}`),
  async download(id: string, suggestedFileName: string): Promise<void> {
    const { blob, fileName } = await apiClient.downloadBlob(`/documents/${id}/download`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName ?? suggestedFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
