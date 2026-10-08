import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../../config/env';
import { prisma } from '../../shared/database/prisma';
import { resolveTwoFactorMasterKey } from '../../shared/security/two-factor';
import { toPublicUser } from '../../shared/utils/serialize-user';
import type { LoginBody, TwoFactorDisableBody, TwoFactorVerifyLoginBody, TwoFactorVerifySetupBody } from './auth.schemas';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

const authService = new AuthService(prisma);

export const twoFactorService = new TwoFactorService(prisma, {
  masterKey: resolveTwoFactorMasterKey({
    encryptionKey: env.TWO_FACTOR_ENCRYPTION_KEY,
    jwtSecret: env.JWT_SECRET,
    nodeEnv: env.NODE_ENV,
  }),
  jwtSecret: env.JWT_SECRET,
  issuer: env.TWO_FACTOR_ISSUER,
});

const actorOf = (request: FastifyRequest) => ({
  userId: request.user.userId,
  officeId: request.user.officeId,
  role: request.user.role,
});

export const authController = {
  async login(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
    const { email, password } = request.body;

    const user = await authService.login(email, password);

    // Usuário com 2FA ativo: NÃO emite o JWT ainda. Devolve um challenge curto (não é um JWT e não
    // autentica nenhuma rota); o accessToken só sai em POST /auth/2fa/verify-login.
    if (await twoFactorService.isEnabledFor(user.id)) {
      return reply.status(200).send({ requiresTwoFactor: true, ...twoFactorService.issueChallenge(user) });
    }

    const accessToken = await reply.jwtSign({
      userId: user.id,
      officeId: user.officeId,
      role: user.role,
    });

    return reply.status(200).send({
      accessToken,
      user: toPublicUser(user),
    });
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = await authService.getAuthenticatedUser(request.user.userId);

    return reply.status(200).send({ user: toPublicUser(user) });
  },

  // --- 2FA -------------------------------------------------------------
  async twoFactorStatus(request: FastifyRequest, reply: FastifyReply) {
    return reply.status(200).send(await twoFactorService.status(actorOf(request)));
  },

  async twoFactorSetup(request: FastifyRequest, reply: FastifyReply) {
    const user = await authService.getAuthenticatedUser(request.user.userId);
    const result = await twoFactorService.setup(actorOf(request), user.email);
    reply.header('Cache-Control', 'no-store');
    return reply.status(200).send(result);
  },

  async twoFactorVerifySetup(request: FastifyRequest<{ Body: TwoFactorVerifySetupBody }>, reply: FastifyReply) {
    const result = await twoFactorService.verifySetup(actorOf(request), request.body.code);
    reply.header('Cache-Control', 'no-store');
    return reply.status(200).send(result);
  },

  async twoFactorDisable(request: FastifyRequest<{ Body: TwoFactorDisableBody }>, reply: FastifyReply) {
    await twoFactorService.disable(actorOf(request), request.body);
    return reply.status(204).send();
  },

  async twoFactorVerifyLogin(request: FastifyRequest<{ Body: TwoFactorVerifyLoginBody }>, reply: FastifyReply) {
    const user = await twoFactorService.verifyLogin(request.body.challengeToken, request.body.code);
    const accessToken = await reply.jwtSign({ userId: user.id, officeId: user.officeId, role: user.role });
    return reply.status(200).send({ accessToken, user: toPublicUser(user) });
  },
};
