import { z } from 'zod';

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LIMIT = 10;
export const SEARCH_DEFAULT_LIMIT = 5;

export const globalSearchQuerySchema = z.object({
  q: z
    .string({ message: 'Informe o termo de busca' })
    .trim()
    .min(SEARCH_MIN_LENGTH, `Digite pelo menos ${SEARCH_MIN_LENGTH} caracteres`)
    .max(100, 'Termo de busca muito longo'),
  /** Máximo de resultados POR categoria. */
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(SEARCH_DEFAULT_LIMIT),
});
export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
