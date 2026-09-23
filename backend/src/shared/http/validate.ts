import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodError, ZodTypeAny } from 'zod';

import { ValidationError } from '../errors';

type RequestPart = 'body' | 'params' | 'querystring';

type Schemas = Partial<Record<RequestPart, ZodTypeAny>>;

/** Forma simples (sem o `this: FastifyInstance` do preHandlerHookHandler do Fastify),
 * para que o resultado de validate() possa ser testado unitariamente chamando-o
 * diretamente, além de continuar aceito pelo Fastify em `preHandler` (tipagem estrutural). */
type SimplePreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface FieldIssue {
  path: string;
  message: string;
}

function formatIssues(part: RequestPart, error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : part,
    message: issue.message,
  }));
}

/**
 * Cria um preHandler do Fastify que valida body/params/querystring com Zod.
 *
 * Em caso de falha, lança ValidationError (400), que é convertida em uma
 * resposta HTTP padronizada pelo error handler central. Em caso de sucesso,
 * substitui request.body/params/query pelos dados já parseados (com
 * coerções e defaults do Zod aplicados), para que controllers e services
 * recebam dados já confiáveis e tipados.
 *
 * Uso:
 *   app.post('/login', { preHandler: validate({ body: loginBodySchema }) }, handler)
 */
export function validate(schemas: Schemas): SimplePreHandler {
  return async (request, _reply) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(request.body);
      if (!result.success) {
        throw new ValidationError('Dados inválidos no corpo da requisição', formatIssues('body', result.error));
      }
      request.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(request.params);
      if (!result.success) {
        throw new ValidationError('Parâmetros de rota inválidos', formatIssues('params', result.error));
      }
      request.params = result.data;
    }

    if (schemas.querystring) {
      const result = schemas.querystring.safeParse(request.query);
      if (!result.success) {
        throw new ValidationError('Parâmetros de query inválidos', formatIssues('querystring', result.error));
      }
      request.query = result.data;
    }
  };
}
