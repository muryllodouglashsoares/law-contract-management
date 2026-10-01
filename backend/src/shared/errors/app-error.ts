/**
 * Erro base de domínio/aplicação. Todo erro esperado (previsível) do
 * sistema deve estender esta classe, para que o error handler central
 * (src/shared/http/error-handler.ts) consiga transformá-lo em uma
 * resposta HTTP consistente sem precisar de try/catch espalhados
 * pelas rotas e serviços.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/** 400 — dados de entrada inválidos (body/params/querystring). */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
}

/** 401 — credenciais ausentes, inválidas ou token expirado/inválido. */
export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_ERROR';
}

/** 403 — usuário autenticado, mas sem permissão para a ação (RBAC). */
export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly code = 'AUTHORIZATION_ERROR';
}

/** 404 — recurso não encontrado. */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'RESOURCE_NOT_FOUND';
}

/** 409 — conflito com o estado atual do recurso (ex.: e-mail já cadastrado). */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}

/** 410 — recurso existiu mas não está mais disponível (ex.: link de aceite expirado/usado). */
export class GoneError extends AppError {
  readonly statusCode = 410;
  readonly code: string;

  constructor(code: string, message: string, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}
