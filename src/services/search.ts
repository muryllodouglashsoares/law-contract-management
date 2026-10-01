import { apiClient } from '../lib/api-client';
import type { GlobalSearchResults } from '../types/api';

export const searchService = {
  global: (q: string) => apiClient.get<{ results: GlobalSearchResults }>('/search/global', { q }),
};
