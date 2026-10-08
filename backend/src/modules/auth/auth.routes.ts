import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/auth/authenticate';
import { validate } from '../../shared/http/validate';
import { authController } from './auth.controller';
import {
  loginBodySchema,
  twoFactorDisableBodySchema,
  twoFactorVerifyLoginBodySchema,
  twoFactorVerifySetupBodySchema,
  type LoginBody,
  type TwoFactorDisableBody,
  type TwoFactorVerifyLoginBody,
  type TwoFactorVerifySetupBody,
} from './auth.schemas';

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

  const rateLimit = {
    max: options.loginRateLimit.max,
    timeWindow: options.loginRateLimit.timeWindow,
    errorResponseBuilder: (_request: unknown, context: { statusCode: number }) => ({
      statusCode: context.statusCode,
      code: 'RATE_LIMIT_EXCEEDED',
      message: LOGIN_RATE_LIMIT_MESSAGE,
    }),
  };

  // 2FA. A etapa de login é pública (o challenge é a credencial) e usa o MESMO rate limit do login.
  app.post<{ Body: TwoFactorVerifyLoginBody }>(
    '/2fa/verify-login',
    { config: { rateLimit }, preHandler: validate({ body: twoFactorVerifyLoginBodySchema }) },
    authController.twoFactorVerifyLogin,
  );
  app.get('/2fa/status', { preHandler: [authenticate] }, authController.twoFactorStatus);
  app.post('/2fa/setup', { preHandler: [authenticate] }, authController.twoFactorSetup);
  app.post<{ Body: TwoFactorVerifySetupBody }>(
    '/2fa/verify-setup',
    { config: { rateLimit }, preHandler: [authenticate, validate({ body: twoFactorVerifySetupBodySchema })] },
    authController.twoFactorVerifySetup,
  );
  app.post<{ Body: TwoFactorDisableBody }>(
    '/2fa/disable',
    { config: { rateLimit }, preHandler: [authenticate, validate({ body: twoFactorDisableBodySchema })] },
    authController.twoFactorDisable,
  );

  app.get(
    '/me',
    { preHandler: [authenticate] },
    authController.me,
  );
}
