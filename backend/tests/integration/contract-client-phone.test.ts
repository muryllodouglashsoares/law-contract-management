import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureContract, createFixtureUser, resetDatabase } from './helpers/db';

/** O DTO de contrato expõe client.phone (botão "Enviar por WhatsApp"), sempre isolado por escritório. */
describe('contrato — client.phone no DTO', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    await resetDatabase();
  });
  afterEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function token(email: string, password: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    return response.json().accessToken;
  }

  it('GET /contracts/:id e a listagem trazem o telefone do cliente (ou null quando ausente)', async () => {
    const user = await createFixtureUser({ role: 'LAWYER' });
    const withPhone = await createFixtureContract(user.officeId, user.userId);
    const withoutPhone = await createFixtureContract(user.officeId, user.userId);
    await prisma.client.update({ where: { id: withPhone.clientId }, data: { phone: '(11) 99999-1111' } });
    const auth = { authorization: `Bearer ${await token(user.email, user.password)}` };

    const one = await app.inject({ method: 'GET', url: `/contracts/${withPhone.id}`, headers: auth });
    expect(one.statusCode).toBe(200);
    expect(one.json().contract.client).toMatchObject({ phone: '(11) 99999-1111' });

    const none = await app.inject({ method: 'GET', url: `/contracts/${withoutPhone.id}`, headers: auth });
    expect(none.json().contract.client.phone).toBeNull();

    const list = await app.inject({ method: 'GET', url: '/contracts', headers: auth });
    const phones = list.json().data.map((c: { id: string; client: { phone: string | null } }) => [c.id, c.client.phone]);
    expect(phones).toContainEqual([withPhone.id, '(11) 99999-1111']);
  });

  it('não vaza contrato (nem telefone) de outro escritório: 404', async () => {
    const owner = await createFixtureUser();
    const outsider = await createFixtureUser();
    const contract = await createFixtureContract(owner.officeId, owner.userId);
    await prisma.client.update({ where: { id: contract.clientId }, data: { phone: '(11) 99999-1111' } });

    const response = await app.inject({
      method: 'GET',
      url: `/contracts/${contract.id}`,
      headers: { authorization: `Bearer ${await token(outsider.email, outsider.password)}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('99999-1111');
  });
});
