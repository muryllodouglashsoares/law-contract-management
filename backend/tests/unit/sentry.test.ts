import type { ErrorEvent } from '@sentry/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { initSentry, sanitizeSentryBreadcrumb, sanitizeSentryEvent } from '../../src/config/sentry';
import { AuthenticationError } from '../../src/shared/errors';
import { errorHandler } from '../../src/shared/http/error-handler';
import { redactSignatureTokenInUrl } from '../../src/shared/security/token';

const TOKEN = 'AbC123_-tokenSecretoDeAceite0123456789xyzABCDE';

function fakeContext(url = '/contracts') {
  const log = { warn: vi.fn(), error: vi.fn() };
  const request = { url, method: 'GET', log } as unknown as FastifyRequest;
  const send = vi.fn();
  const status = vi.fn(() => ({ send }));
  const reply = { status } as unknown as FastifyReply;
  return { request, reply, status, send, log };
}

describe('Sentry opcional (backend)', () => {
  it('sem SENTRY_DSN não inicializa', () => {
    expect(process.env.SENTRY_DSN).toBeUndefined();
    expect(initSentry()).toBe(false);
  });

  it('errorHandler continua devolvendo 500 padronizado sem DSN', () => {
    const { request, reply, status, send, log } = fakeContext();

    errorHandler(new Error('falha inesperada'), request, reply);

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'falha inesperada' },
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('AppError e 4xx mantêm a resposta atual (nunca vão ao Sentry)', () => {
    const app = fakeContext();
    errorHandler(new AuthenticationError('Não autorizado'), app.request, app.reply);
    expect(app.status).toHaveBeenCalledWith(401);
    expect(app.send).toHaveBeenCalledWith({ error: { code: 'AUTHENTICATION_ERROR', message: 'Não autorizado' } });

    const fastify4xx = fakeContext();
    const bad = Object.assign(new Error('JSON inválido'), { statusCode: 400, code: 'FST_ERR_CTP_INVALID_JSON_BODY' });
    errorHandler(bad, fastify4xx.request, fastify4xx.reply);
    expect(fastify4xx.status).toHaveBeenCalledWith(400);
  });
});

describe('redactSignatureTokenInUrl', () => {
  it('remove o token da URL pública preservando o restante', () => {
    expect(redactSignatureTokenInUrl(`/public/signatures/${TOKEN}`)).toBe('/public/signatures/[REDACTED]');
    expect(redactSignatureTokenInUrl(`/public/signatures/${TOKEN}/sign?x=1#h`)).toBe(
      '/public/signatures/[REDACTED]/sign?x=1#h',
    );
    expect(redactSignatureTokenInUrl(`https://api.exemplo.com/public/signatures/${TOKEN}`)).not.toContain(TOKEN);
    expect(redactSignatureTokenInUrl('/contracts?search=abc')).toBe('/contracts?search=abc');
  });
});

describe('sanitização de eventos do Sentry', () => {
  it('remove token, body, cookies, headers e usuário do evento', () => {
    const event = {
      type: undefined,
      transaction: `GET /public/signatures/${TOKEN}`,
      request: {
        url: `https://api.exemplo.com/public/signatures/${TOKEN}/sign`,
        data: { password: 'Senha@123', email: 'cliente@example.com' },
        cookies: { session: 'abc' },
        headers: { authorization: 'Bearer jwt' },
        query_string: 'email=cliente@example.com',
      },
      user: { email: 'cliente@example.com', username: 'Cliente' },
      breadcrumbs: [
        { category: 'http', data: { url: `/public/signatures/${TOKEN}`, request_body: '{"a":1}' } },
      ],
    } as unknown as ErrorEvent;

    const clean = sanitizeSentryEvent(event);

    expect(clean.request?.url).toBe('https://api.exemplo.com/public/signatures/[REDACTED]/sign');
    expect(clean.request?.data).toBeUndefined();
    expect(clean.request?.cookies).toBeUndefined();
    expect(clean.request?.headers).toBeUndefined();
    expect(clean.request?.query_string).toBeUndefined();
    expect(clean.user).toBeUndefined();
    expect(JSON.stringify(clean)).not.toContain(TOKEN);
    expect(clean.breadcrumbs?.[0]?.data).toEqual({ url: '/public/signatures/[REDACTED]' });
  });

  it('breadcrumb de mensagem também é mascarado', () => {
    const crumb = sanitizeSentryBreadcrumb({ message: `GET /public/signatures/${TOKEN}` });
    expect(crumb.message).toBe('GET /public/signatures/[REDACTED]');
  });
});
