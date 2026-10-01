import type { FastifyInstance } from 'fastify';

import { validate } from '../../shared/http/validate';
import { contractSignatureController } from './contract-signature.controller';
import {
  publicTokenParamsSchema,
  signContractBodySchema,
  type PublicTokenParams,
  type SignContractBody,
} from './contract-signature.schemas';

export interface PublicSignatureRoutesOptions {
  rateLimit: { max: number; timeWindow: string | number };
}

export const PUBLIC_SIGNATURE_RATE_LIMIT_MESSAGE = 'Muitas requisições. Aguarde um instante e tente novamente.';

/**
 * Rotas PÚBLICAS (sem JWT) do aceite eletrônico. O token é a credencial; por isso há rate
 * limit próprio por IP. A assinatura (POST) tem um limite mais baixo que a consulta (GET),
 * sem atrapalhar quem abre o link, corrige o formulário e reenvia algumas vezes.
 */
export async function publicSignatureRoutes(app: FastifyInstance, options: PublicSignatureRoutesOptions): Promise<void> {
  const rateLimit = (max: number) => ({
    max,
    timeWindow: options.rateLimit.timeWindow,
    errorResponseBuilder: (_request: unknown, context: { statusCode: number }) => ({
      statusCode: context.statusCode,
      code: 'RATE_LIMIT_EXCEEDED',
      message: PUBLIC_SIGNATURE_RATE_LIMIT_MESSAGE,
    }),
  });

  app.get<{ Params: PublicTokenParams }>(
    '/signatures/:token',
    {
      config: { rateLimit: rateLimit(options.rateLimit.max) },
      preHandler: validate({ params: publicTokenParamsSchema }),
    },
    contractSignatureController.publicView,
  );

  app.post<{ Params: PublicTokenParams; Body: SignContractBody }>(
    '/signatures/:token/sign',
    {
      config: { rateLimit: rateLimit(Math.max(3, Math.ceil(options.rateLimit.max / 3))) },
      preHandler: validate({ params: publicTokenParamsSchema, body: signContractBodySchema }),
    },
    contractSignatureController.publicSign,
  );
}
