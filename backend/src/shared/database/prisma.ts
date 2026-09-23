import { PrismaClient } from '@prisma/client';

import { env } from '../../config/env';

/**
 * Instância única do PrismaClient, reaproveitada em toda a aplicação
 * (evita esgotar o pool de conexões do Postgres com múltiplas instâncias,
 * problema comum em dev com hot-reload).
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
