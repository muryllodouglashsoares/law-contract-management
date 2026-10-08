import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from '../../shared/database/prisma';
import { toPublicPayment } from '../../shared/utils/serialize-payment';
import type {
  CreatePaymentBody,
  GenerateInstallmentsBody,
  ListPaymentsQuery,
  PaymentIdParams,
  RegisterPaymentBody,
  UpdatePaymentBody,
} from './payment.schemas';
import { PaymentService } from './payment.service';

const paymentService = new PaymentService(prisma);

export const paymentController = {
  async previewInstallments(request: FastifyRequest<{ Body: GenerateInstallmentsBody }>, reply: FastifyReply) {
    const preview = await paymentService.previewInstallments(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.body,
    );
    return reply.status(200).send(preview);
  },

  async generateInstallments(request: FastifyRequest<{ Body: GenerateInstallmentsBody }>, reply: FastifyReply) {
    const result = await paymentService.generateInstallments(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.body,
    );
    return reply.status(201).send({ data: result.data.map((p) => toPublicPayment(p)) });
  },

  async summary(request: FastifyRequest, reply: FastifyReply) {
    const summary = await paymentService.summary(request.user.officeId);
    return reply.status(200).send(summary);
  },

  async list(request: FastifyRequest<{ Querystring: ListPaymentsQuery }>, reply: FastifyReply) {
    const result = await paymentService.list(request.user.officeId, request.query);
    return reply.status(200).send({
      data: result.data.map((p) => toPublicPayment(p)),
      pagination: result.pagination,
    });
  },

  async getById(request: FastifyRequest<{ Params: PaymentIdParams }>, reply: FastifyReply) {
    const payment = await paymentService.getById(request.user.officeId, request.params.id);
    return reply.status(200).send({ payment: toPublicPayment(payment) });
  },

  async create(request: FastifyRequest<{ Body: CreatePaymentBody }>, reply: FastifyReply) {
    const payment = await paymentService.create(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.body,
    );
    return reply.status(201).send({ payment: toPublicPayment(payment) });
  },

  async update(
    request: FastifyRequest<{ Params: PaymentIdParams; Body: UpdatePaymentBody }>,
    reply: FastifyReply,
  ) {
    const payment = await paymentService.update(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
      request.body,
    );
    return reply.status(200).send({ payment: toPublicPayment(payment) });
  },

  async registerPayment(
    request: FastifyRequest<{ Params: PaymentIdParams; Body: RegisterPaymentBody }>,
    reply: FastifyReply,
  ) {
    const payment = await paymentService.registerPayment(
      { userId: request.user.userId, officeId: request.user.officeId },
      request.params.id,
      request.body,
    );
    return reply.status(200).send({ payment: toPublicPayment(payment) });
  },
};
