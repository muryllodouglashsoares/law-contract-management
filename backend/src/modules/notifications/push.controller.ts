import type { FastifyReply, FastifyRequest } from 'fastify';

import { pushService } from './push.instance';
import type { SubscribePushBody, UnsubscribePushBody } from './push.schemas';

function actorOf(request: FastifyRequest) {
  return { userId: request.user.userId, officeId: request.user.officeId };
}

export const pushController = {
  async status(request: FastifyRequest, reply: FastifyReply) {
    return reply.status(200).send(await pushService.status(actorOf(request)));
  },

  async subscribe(request: FastifyRequest<{ Body: SubscribePushBody }>, reply: FastifyReply) {
    const { endpoint, keys } = request.body;
    await pushService.subscribe(actorOf(request), { endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return reply.status(204).send();
  },

  async unsubscribe(request: FastifyRequest<{ Body: UnsubscribePushBody }>, reply: FastifyReply) {
    await pushService.unsubscribe(actorOf(request), request.body.endpoint);
    return reply.status(204).send();
  },

  async test(request: FastifyRequest, reply: FastifyReply) {
    const result = await pushService.sendTest(actorOf(request));
    return reply.status(200).send({ sent: result.sent });
  },
};
