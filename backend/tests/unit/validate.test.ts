import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ValidationError } from '../../src/shared/errors';
import { validate } from '../../src/shared/http/validate';

describe('validate() preHandler', () => {
  const bodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  it('aceita um body válido e normaliza request.body com os dados parseados', async () => {
    const handler = validate({ body: bodySchema });
    const request = { body: { email: 'user@example.com', password: '123456' } } as unknown as FastifyRequest;

    await handler(request, {} as FastifyReply);

    expect(request.body).toEqual({ email: 'user@example.com', password: '123456' });
  });

  it('rejeita um body inválido com ValidationError e detalhes por campo', async () => {
    const handler = validate({ body: bodySchema });
    const request = { body: { email: 'not-an-email', password: '123' } } as unknown as FastifyRequest;

    try {
      await handler(request, {} as FastifyReply);
      expect.fail('deveria ter lançado ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.statusCode).toBe(400);
      expect(validationError.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'email' }),
          expect.objectContaining({ path: 'password' }),
        ]),
      );
    }
  });

  it('não lança erro algum quando nenhum schema é informado para a parte da requisição', async () => {
    const handler = validate({});
    const request = { body: { anything: true } } as unknown as FastifyRequest;

    await expect(handler(request, {} as FastifyReply)).resolves.toBeUndefined();
  });
});
