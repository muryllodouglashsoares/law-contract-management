import * as Sentry from '@sentry/node';
import type { FastifyRequest } from 'fastify';

import { redactSignatureTokenInUrl } from '../shared/security/token';
import { env } from './env';

/**
 * Sentry do backend — SOMENTE captura de erros inesperados (5xx).
 *
 * Totalmente opcional: sem SENTRY_DSN nada é inicializado e `captureUnexpectedError`
 * vira um no-op. A inicialização acontece uma única vez em `server.ts` (nunca em
 * `buildApp()`), para que os testes com `app.inject()` não sejam afetados.
 *
 * Privacidade (LGPD): sem PII padrão, sem body, sem cookies/Authorization e sem
 * usuário. URLs passam por `redactSignatureTokenInUrl` (token de aceite eletrônico).
 */

type SentryEvent = Sentry.ErrorEvent;
type SentryBreadcrumb = Sentry.Breadcrumb;

/** Remove tudo que pode conter dado pessoal/segredo e mascara o token nas URLs. */
export function sanitizeSentryEvent<T extends SentryEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = redactSignatureTokenInUrl(event.request.url);
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.user;
  if (event.transaction) event.transaction = redactSignatureTokenInUrl(event.transaction);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb));
  }
  return event;
}

export function sanitizeSentryBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb {
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = redactSignatureTokenInUrl(breadcrumb.message);
  }
  const data = breadcrumb.data;
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      const value = data[key];
      if (typeof value === 'string') data[key] = redactSignatureTokenInUrl(value);
    }
    // Corpo/cabeçalhos de requisições nunca devem acompanhar o breadcrumb.
    delete data.request_body;
    delete data.headers;
  }
  return breadcrumb;
}

/** Inicializa o Sentry se (e somente se) SENTRY_DSN estiver definido. Retorna se foi ativado. */
export function initSentry(): boolean {
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
    // No SDK v11 `sendDefaultPii` deixou de existir: `dataCollection` o substitui e seus padrões
    // coletam MAIS (cookies, headers, bodies, variáveis locais). Tudo é desligado explicitamente.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
  });
  return true;
}

/** Envia um erro inesperado (500) ao Sentry. No-op quando o Sentry não foi inicializado. */
export function captureUnexpectedError(error: unknown, request: FastifyRequest): void {
  if (!Sentry.isInitialized()) return;

  Sentry.withScope((scope) => {
    scope.setTag('http.method', request.method);
    // Só método + URL sem token. Nada de body, headers ou dados do usuário.
    scope.setContext('request', { method: request.method, url: redactSignatureTokenInUrl(request.url) });
    Sentry.captureException(error);
  });
}

/** Aguarda o envio dos eventos pendentes antes de encerrar o processo. */
export async function closeSentry(): Promise<void> {
  if (Sentry.isInitialized()) await Sentry.close(2000);
}
