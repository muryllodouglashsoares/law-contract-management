import * as Sentry from '@sentry/react';

import { redactSignatureToken } from './redact-signature-token';

/**
 * Sentry do frontend — somente captura de erros, 100% opcional.
 *
 * Sem VITE_SENTRY_DSN nada é inicializado. Sem Replay, sem profiling e sem tracing
 * (`tracesSampleRate: 0`, nenhuma integração de tracing registrada).
 *
 * Privacidade (LGPD): nada de usuário/e-mail/nome, cookies, headers ou bodies; o token de
 * aceite eletrônico (`/assinar/<token>`) é mascarado em URLs, breadcrumbs e nome de transação.
 */

/** Aplica a máscara a todas as strings de um valor (preserva a forma: o tipo de saída é o de entrada). */
function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactSignatureToken(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redactDeep(inner)])) as T;
  }
  return value;
}

export function sanitizeSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = redactSignatureToken(event.request.url);
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.user;
  if (event.transaction) event.transaction = redactSignatureToken(event.transaction);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(sanitizeSentryBreadcrumb);
  // Contextos/extras/tags e mensagens de exceção podem carregar a URL da página.
  if (event.contexts) event.contexts = redactDeep(event.contexts);
  if (event.extra) event.extra = redactDeep(event.extra);
  if (event.tags) event.tags = redactDeep(event.tags);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSignatureToken(exception.value);
  }
  return event;
}

export function sanitizeSentryBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (typeof breadcrumb.message === 'string') breadcrumb.message = redactSignatureToken(breadcrumb.message);
  if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data);
  return breadcrumb;
}

/** Inicializa o Sentry somente se `VITE_SENTRY_DSN` estiver preenchido. */
export function initSentry(): boolean {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // No SDK v11 `sendDefaultPii` deixou de existir: `dataCollection` o substitui e seus padrões
    // coletam MAIS (cookies, headers, bodies). Tudo é desligado explicitamente.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
  });
  return true;
}
