# Observabilidade (Sentry)

Captura de **erros** no frontend e no backend, 100% opcional. Sem DSN o Sentry **não é inicializado** e nada é enviado: o desenvolvimento, os testes e o CI funcionam sem configuração.

| Variável            | Onde                         | Descrição                                                    |
| ------------------- | ---------------------------- | ------------------------------------------------------------ |
| `SENTRY_DSN`        | Backend (Render)             | DSN do projeto *LexContract Backend*. Ausente = desativado   |
| `SENTRY_ENVIRONMENT`| Backend (Render)             | Opcional; assume `NODE_ENV` quando não definida              |
| `VITE_SENTRY_DSN`   | Frontend (build, Cloudflare) | DSN do projeto *LexContract Frontend*. Ausente = desativado  |

- Sem Session Replay, sem profiling e sem tracing (`tracesSampleRate: 0`). Upload de source maps **não** é feito nesta etapa.
- **Backend**: inicializado uma única vez em `backend/src/server.ts` (nunca em `buildApp()`, para não interferir nos testes com `app.inject()`). O error handler global reporta **apenas erros inesperados que viram 500**; `AppError` e 4xx não são enviados. A resposta HTTP e o log continuam idênticos.
- **Frontend**: inicializado em `src/main.tsx`. Um *Error Boundary* global (`GlobalErrorBoundary`) mostra uma tela de erro amigável, com botão para recarregar, em vez de tela branca.
- **Privacidade (LGPD)**: sem PII padrão, sem usuário/e-mail/nome, sem cookies, sem `Authorization`/headers e sem body de requisição. (No SDK v11 a opção `sendDefaultPii` foi substituída por `dataCollection`, configurada aqui com tudo desligado.)
- **Tokens de assinatura nunca chegam ao Sentry**: `/public/signatures/<token>` (backend, via `redactSignatureTokenInUrl`) e `/assinar/<token>` (frontend, `src/lib/redact-signature-token.ts`) viram `[REDACTED]` em URLs de evento, breadcrumbs, contextos e nome de transação (`beforeSend`/`beforeBreadcrumb`).
- **CSP**: a origem do DSN do frontend é acrescentada **somente** ao `connect-src` e **somente** quando `VITE_SENTRY_DSN` está definido (plugin `securityHeadersApiOrigin`, mesmo mecanismo da origem da API). As demais diretivas não mudam.
