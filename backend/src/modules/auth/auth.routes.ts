import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { authController } from './auth.controller';
import { loginBodySchema, type LoginBody } from './auth.schemas';

export interface AuthRoutesOptions {
  loginRateLimit: { max: number; timeWindow: string | number };
}

export const LOGIN_RATE_LIMIT_MESSAGE = 'Muitas tentativas de login. Tente novamente em instantes.';

export async function authRoutes(app: FastifyInstance, options: AuthRoutesOptions): Promise<void> {
  app.post<{ Body: LoginBody }>(
    '/login',
    {
      config: {
        rateLimit: {
          max: options.loginRateLimit.max,
          timeWindow: options.loginRateLimit.timeWindow,
          // O objeto lançado passa pelo error handler central, que já produz
          // { error: { code, message } } a partir de statusCode/code/message.
          errorResponseBuilder: (_request, context) => ({
            statusCode: context.statusCode,
            code: 'RATE_LIMIT_EXCEEDED',
            message: LOGIN_RATE_LIMIT_MESSAGE,
          }),
        },
      },
      preHandler: validate({ body: loginBodySchema }),
    },
    authController.login,
  );

  app.get(
    '/me',
    { preHandler: [authenticate] },
    authController.me,
  );
}
