import { buildApp } from './app';
import { env } from './config/env';
import { prisma } from './shared/database/prisma';

async function start(): Promise<void> {
  const app = buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Recebido ${signal}, encerrando servidor...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`LexContract backend rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
