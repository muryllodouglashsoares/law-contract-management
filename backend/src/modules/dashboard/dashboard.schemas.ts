import { z } from 'zod';

import { RECEIVABLE_PERIODS } from './receivables.service';

export const receivablesQuerySchema = z.object({
  period: z.enum(RECEIVABLE_PERIODS).default('this_month'),
  /** Somente para period=custom (YYYY-MM-DD). */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Tabela de inadimplência. */
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  /** Exportação: todas as parcelas do período ou somente as vencidas. */
  scope: z.enum(['all', 'overdue']).default('all'),
});
export type ReceivablesQuery = z.infer<typeof receivablesQuerySchema>;
