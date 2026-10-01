import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env';
import { auditRoutes } from './modules/audit/audit.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { clientRoutes } from './modules/clients/client.routes';
import { ContractRenewalJobService } from './modules/contract-renewal/contract-renewal-job.service';
import { publicSignatureRoutes } from './modules/contract-signatures/public-signature.routes';
import { contractTemplateRoutes } from './modules/contract-templates/contract-template.routes';
import { contractRoutes } from './modules/contracts/contract.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { documentRoutes } from './modules/documents/document.routes';
import { internalJobsRoutes, type RenewalJobRunner } from './modules/internal-jobs/internal-jobs.routes';
import { notificationRoutes } from './modules/notifications/notification.routes';
import { officeRoutes } from './modules/offices/office.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { searchRoutes } from './modules/search/search.routes';
import { userRoutes } from './modules/users/user.routes';
import { prisma } from './shared/database/prisma';
import { errorHandler } from './shared/http/error-handler';
import { redactSignatureTokenInUrl } from './shared/security/token';

/**
 * Monta e configura a instância do Fastify, sem chamar listen().
 *
 * Separar app.ts de server.ts permite que os testes de integração
 * usem app.inject() diretamente, sem precisar abrir uma porta TCP real.
 */
export interface BuildAppOptions {
  /** Sobrescreve o limite de POST /auth/login (usado apenas em testes). Padrão: variáveis de ambiente. */
  loginRateLimit?: { max: number; timeWindow: string | number };
  /** Sobrescreve o rate limit dos endpoints públicos de aceite (usado apenas em testes). */
  publicSignatureRateLimit?: { max: number; timeWindow: string | number };
  /** Sobrescreve o CRON_SECRET (usado apenas em testes). `undefined` mantém o valor do ambiente. */
  cronSecret?: string;
  /** Substitui o job de renovação (usado em testes unitários sem banco). */
  renewalJob?: RenewalJobRunner;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    // A API roda atrás do proxy do Render: sem isso, request.ip seria o IP do
    // proxy e o rate limit (por IP) valeria para todos os clientes juntos.
    trustProxy: true,
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
      // O token do aceite eletrônico viaja no caminho da URL (/public/signatures/<token>):
      // o redact do pino não mascara trechos de string, então o serializer de `req` troca o
      // token por [REDACTED] antes de qualquer linha de log (incoming request/completed/erro).
      serializers: {
        req(request: { method?: string; url?: string; headers?: Record<string, unknown>; ip?: string }) {
          return {
            method: request.method,
            url: request.url ? redactSignatureTokenInUrl(request.url) : request.url,
            host: request.headers?.host,
            remoteAddress: request.ip,
          };
        },
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : {}),
    },
  });

  // Headers de segurança da API. Registrado antes do CORS e das rotas.
  app.register(helmet, {
    // A CSP é aplicada no frontend (public/_headers); a API só devolve JSON e
    // arquivos para download (nunca HTML/JavaScript executável), então não há
    // o que uma CSP protegeria aqui.
    contentSecurityPolicy: false,
    // O frontend (Cloudflare Pages) está em outro domínio e consome a API e
    // os downloads via fetch: o padrão `same-origin` bloquearia essas respostas.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // HSTS somente em produção (HTTPS); em desenvolvimento local seria nocivo.
    strictTransportSecurity:
      env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true } : false,
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
  });

  // Rate limit: `global: false` — nenhuma rota é limitada por padrão; cada rota
  // sensível opta por `config.rateLimit` (hoje, somente POST /auth/login).
  //
  // O store padrão é em memória: funciona corretamente para uma única instância.
  // Em múltiplas instâncias/containers será necessário um store compartilhado
  // (ex.: Redis), caso contrário cada instância terá seu próprio contador.
  app.register(rateLimit, { global: false });
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
  app.register(authRoutes, {
    prefix: '/auth',
    loginRateLimit: options.loginRateLimit ?? {
      max: env.LOGIN_RATE_LIMIT_MAX,
      timeWindow: env.LOGIN_RATE_LIMIT_WINDOW,
    },
  });
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
  app.register(searchRoutes, { prefix: '/search' });

  // Aceite eletrônico por link público (SEM JWT; o token é a credencial; rate limit próprio).
  app.register(publicSignatureRoutes, {
    prefix: '/public',
    rateLimit: options.publicSignatureRateLimit ?? {
      max: env.PUBLIC_SIGNATURE_RATE_LIMIT_MAX,
      timeWindow: env.PUBLIC_SIGNATURE_RATE_LIMIT_WINDOW,
    },
  });

  // Jobs internos (GitHub Actions). Protegidos por CRON_SECRET, não pelo JWT de usuário.
  app.register(internalJobsRoutes, {
    prefix: '/internal',
    cronSecret: options.cronSecret ?? env.CRON_SECRET,
    renewalJob: options.renewalJob ?? new ContractRenewalJobService(prisma),
  });

  return app;
}
