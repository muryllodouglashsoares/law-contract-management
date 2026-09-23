import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../../config/env';
import { AppError } from '../errors';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Handler central de erros da aplicação. Registrado em app.ts via
 * app.setErrorHandler(errorHandler).
 *
 * Responsabilidades:
 *  - Traduzir AppError (erros de domínio) em respostas HTTP previsíveis.
 *  - Traduzir erros de validação/parsing do próprio Fastify (ex.: JSON
 *    malformado, erros de schema nativo) em 400 consistente.
 *  - Nunca vazar stack trace em produção.
 *  - Logar detalhes suficientes para depuração sem registrar dados sensíveis
 *    (o redact de senha/JWT já é feito na configuração do logger em app.ts).
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Erros de domínio conhecidos e esperados.
  if (error instanceof AppError) {
    request.log.warn({ code: error.code, details: error.details }, error.message);

    const body: ErrorBody = {
      error: { code: error.code, message: error.message },
    };
    if (error.details !== undefined) {
      body.error.details = error.details;
    }

    reply.status(error.statusCode).send(body);
    return;
  }

  const fastifyError = error as FastifyError;
  const statusCode = fastifyError.statusCode ?? 500;

  // Erros 4xx originados do próprio Fastify (ex.: JSON body malformado,
  // payload muito grande, validação nativa de schema) — ainda são erros
  // esperados do cliente, não bugs do servidor.
  if (statusCode >= 400 && statusCode < 500) {
    request.log.warn({ err: error }, error.message);
    const body: ErrorBody = {
      error: {
        code: fastifyError.code ?? 'BAD_REQUEST',
        message: error.message || 'Requisição inválida',
      },
    };
    reply.status(statusCode).send(body);
    return;
  }

  // Qualquer outra coisa é inesperada: logar em nível error e nunca
  // expor detalhes internos (stack trace, mensagem de driver, etc.) em produção.
  request.log.error({ err: error }, 'Erro não tratado');

  const body: ErrorBody = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'Erro interno do servidor'
          : (error.message ?? 'Erro interno do servidor'),
    },
  };
  reply.status(500).send(body);
}
