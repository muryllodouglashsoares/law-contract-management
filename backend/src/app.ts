import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env';
import { auditRoutes } from './modules/audit/audit.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { clientRoutes } from './modules/clients/client.routes';
import { contractTemplateRoutes } from './modules/contract-templates/contract-template.routes';
import { contractRoutes } from './modules/contracts/contract.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { documentRoutes } from './modules/documents/document.routes';
import { notificationRoutes } from './modules/notifications/notification.routes';
import { officeRoutes } from './modules/offices/office.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { userRoutes } from './modules/users/user.routes';
import { prisma } from './shared/database/prisma';
import { errorHandler } from './shared/http/error-handler';

/**
 * Monta e configura a instância do Fastify, sem chamar listen().
 *
 * Separar app.ts de server.ts permite que os testes de integração
 * usem app.inject() diretamente, sem precisar abrir uma porta TCP real.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Nunca logar senha, hash de senha, token JWT ou o header de autorização.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.passwordHash',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : {}),
    },
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES, files: 1 },
  });

  app.setErrorHandler(errorHandler);

  // Health checks -----------------------------------------------------
  app.get('/health', async () => ({ status: 'ok' }));

  // Verificação mais profunda, incluindo conectividade com o banco.
  // Útil para readiness probes em produção (ex.: orquestradores de deploy).
  app.get('/health/db', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.status(200).send({ status: 'ok', database: 'up' });
    } catch (error) {
      app.log.error({ err: error }, 'Falha no health check do banco de dados');
      return reply.status(503).send({ status: 'error', database: 'down' });
    }
  });

  // Módulos -------------------------------------------------------------
  app.register(authRoutes, { prefix: '/auth' });
  app.register(userRoutes, { prefix: '/users' });
  app.register(officeRoutes, { prefix: '/offices' });
  app.register(clientRoutes, { prefix: '/clients' });
  app.register(contractTemplateRoutes, { prefix: '/contract-templates' });
  app.register(contractRoutes, { prefix: '/contracts' });
  app.register(documentRoutes, { prefix: '/documents' });
  app.register(paymentRoutes, { prefix: '/payments' });
  app.register(notificationRoutes, { prefix: '/notifications' });
  app.register(auditRoutes, { prefix: '/audit' });
  app.register(dashboardRoutes, { prefix: '/dashboard' });

  return app;
}
