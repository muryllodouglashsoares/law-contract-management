import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureContract, createFixtureUser, resetDatabase } from './helpers/db';

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}

describe('GET /search/global', () => {
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

  const search = (token: string, q: string, extra = '') =>
    app.inject({ method: 'GET', url: `/search/global?q=${encodeURIComponent(q)}${extra}`, headers: { authorization: `Bearer ${token}` } });

  async function seed(officeId: string, userId: string, tag: string) {
    const client = await prisma.client.create({
      data: { officeId, type: 'PF', name: `Zefirino ${tag}`, document: `999${tag}`, email: `zef-${tag}@example.com` },
    });
    const template = await prisma.contractTemplate.create({ data: { officeId, name: `Modelo Zefirino ${tag}`, content: 'segredo-do-conteudo' } });
    const contract = await createFixtureContract(officeId, userId, { clientId: client.id, templateId: template.id, object: `Objeto Zefirino ${tag}` });
    await prisma.document.create({
      data: {
        officeId, contractId: contract.id, uploadedById: userId, fileName: `zefirino-${tag}.pdf`, fileType: 'PDF',
        mimeType: 'application/pdf', sizeBytes: 10, storagePath: `${officeId}/arquivo-secreto.pdf`,
      },
    });
    return { client, template, contract };
  }

  it('exige autenticação', async () => {
    const response = await app.inject({ method: 'GET', url: '/search/global?q=abc' });
    expect(response.statusCode).toBe(401);
  });

  it('encontra clientes, contratos, modelos, documentos e usuários (ADMIN)', async () => {
    const f = await createFixtureUser({ role: 'ADMIN' });
    await prisma.user.update({ where: { id: f.userId }, data: { name: 'Zefirino Admin' } });
    const seeded = await seed(f.officeId, f.userId, 'A');
    const token = await login(app, f.email, f.password);

    const response = await search(token, 'zefirino');
    expect(response.statusCode).toBe(200);
    const { results } = response.json();

    expect(results.clients.map((c: { id: string }) => c.id)).toContain(seeded.client.id);
    expect(results.contracts[0]).toMatchObject({ id: seeded.contract.id, number: seeded.contract.number, label: `Contrato #${seeded.contract.number}`, clientName: 'Zefirino A' });
    expect(results.templates[0].id).toBe(seeded.template.id);
    expect(results.documents[0]).toMatchObject({ label: 'zefirino-A.pdf', contractId: seeded.contract.id });
    expect(results.users[0].label).toBe('Zefirino Admin');
  });

  it('busca contrato pelo número (com e sem #)', async () => {
    const f = await createFixtureUser();
    const c = await createFixtureContract(f.officeId, f.userId);
    const token = await login(app, f.email, f.password);

    for (const q of [`#${c.number}`, String(c.number).padStart(2, '0')]) {
      const { results } = (await search(token, q)).json();
      expect(results.contracts.some((x: { id: string }) => x.id === c.id)).toBe(true);
    }
  });

  it('só devolve usuários para ADMIN', async () => {
    const admin = await createFixtureUser({ role: 'ADMIN' });
    const lawyer = await createFixtureUser({ officeId: admin.officeId, role: 'LAWYER' });
    await prisma.user.update({ where: { id: lawyer.userId }, data: { name: 'Zefirino Advogado' } });
    const token = await login(app, lawyer.email, lawyer.password);

    const { results } = (await search(token, 'zefirino')).json();
    expect(results.users).toEqual([]);
  });

  it('isola por escritório', async () => {
    const a = await createFixtureUser();
    const b = await createFixtureUser();
    await seed(a.officeId, a.userId, 'A');
    const seededB = await seed(b.officeId, b.userId, 'B');
    const tokenA = await login(app, a.email, a.password);

    const { results } = (await search(tokenA, 'zefirino')).json();
    const all = JSON.stringify(results);
    expect(all).not.toContain(seededB.client.id);
    expect(all).not.toContain('Zefirino B');
    expect(results.clients).toHaveLength(1);
  });

  it('respeita o limite por categoria e o máximo', async () => {
    const f = await createFixtureUser();
    for (let i = 0; i < 12; i++) {
      await prisma.client.create({ data: { officeId: f.officeId, type: 'PF', name: `Limite ${i}`, document: `lim-${i}`, email: `lim${i}@example.com` } });
    }
    const token = await login(app, f.email, f.password);

    expect((await search(token, 'limite')).json().results.clients).toHaveLength(5); // padrão
    expect((await search(token, 'limite', '&limit=3')).json().results.clients).toHaveLength(3);
    expect((await search(token, 'limite', '&limit=10')).json().results.clients).toHaveLength(10);
    expect((await search(token, 'limite', '&limit=11')).statusCode).toBe(400); // acima do máximo
  });

  it('rejeita query vazia, curta ou ausente', async () => {
    const f = await createFixtureUser();
    const token = await login(app, f.email, f.password);

    expect((await search(token, '')).statusCode).toBe(400);
    expect((await search(token, 'a')).statusCode).toBe(400);
    expect((await search(token, '   ')).statusCode).toBe(400);
    const missing = await app.inject({ method: 'GET', url: '/search/global', headers: { authorization: `Bearer ${token}` } });
    expect(missing.statusCode).toBe(400);
  });

  it('não vaza dados sensíveis (passwordHash, storagePath, conteúdo do contrato/modelo)', async () => {
    const f = await createFixtureUser({ role: 'ADMIN' });
    await seed(f.officeId, f.userId, 'A');
    const token = await login(app, f.email, f.password);

    const body = (await search(token, 'usu')).body + (await search(token, 'zefirino')).body;
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('arquivo-secreto');
    expect(body).not.toContain('storagePath');
    expect(body).not.toContain('segredo-do-conteudo');
    expect(body).not.toContain('Texto da versão 1');
  });

  it('ignora officeId enviado pelo cliente e trata caracteres especiais como texto', async () => {
    const a = await createFixtureUser();
    const b = await createFixtureUser();
    const seededB = await seed(b.officeId, b.userId, 'B');
    const tokenA = await login(app, a.email, a.password);

    const spoof = await search(tokenA, 'zefirino', `&officeId=${b.officeId}`);
    expect(JSON.stringify(spoof.json().results)).not.toContain(seededB.client.id);

    const injection = await search(tokenA, "'; DROP TABLE clients; --");
    expect(injection.statusCode).toBe(200);
    expect(await prisma.client.count()).toBeGreaterThan(0);

    const wildcard = await search(tokenA, '%%');
    expect(wildcard.json().results.clients).toEqual([]);
  });
});
