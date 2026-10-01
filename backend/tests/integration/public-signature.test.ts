import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { computeSignatureHash } from '../../src/shared/security/signature-hash';
import { createFixtureContract, createFixtureUser, resetDatabase, type TestFixture } from './helpers/db';

const CPF = '529.982.247-25';
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

describe('aceite eletrônico por link público', () => {
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

  async function login(f: TestFixture): Promise<Record<string, string>> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: f.email, password: f.password } });
    return { authorization: `Bearer ${res.json().accessToken}` };
  }

  async function setup(status: 'ENVIADO' | 'EM_REVISAO' | 'PRONTO_ENVIO' | 'ATIVO' = 'ENVIADO') {
    const f = await createFixtureUser({ role: 'LAWYER' });
    const contract = await createFixtureContract(f.officeId, f.userId, { status, endDate: new Date('2027-01-31T00:00:00Z') });
    const auth = await login(f);
    return { f, contract, auth };
  }

  async function generate(auth: Record<string, string>, contractId: string) {
    const res = await app.inject({ method: 'POST', url: `/contracts/${contractId}/signature-links`, headers: auth });
    return { res, token: res.statusCode === 201 ? (res.json().url as string).split('/assinar/')[1]! : '' };
  }

  const sign = (token: string, extra: Record<string, unknown> = {}, remoteAddress?: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: `/public/signatures/${token}/sign`,
      remoteAddress,
      headers,
      payload: { signerName: 'Maria da Silva', signerDocument: CPF, consent: true, ...extra },
    });

  // ---- geração do link -------------------------------------------------

  it('gera link (201) com URL da origem configurada, expiração e uso único; token não é salvo em texto puro', async () => {
    const { contract, auth, f } = await setup();
    const { res, token } = await generate(auth, contract.id);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.url).toBe(`https://app.lexcontract.test/assinar/${token}`);
    expect(body.singleUse).toBe(true);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const hoursLeft = (new Date(body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(71.9);
    expect(hoursLeft).toBeLessThanOrEqual(72);

    const row = await prisma.contractPublicSignature.findFirstOrThrow({ where: { contractId: contract.id } });
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.contractVersionId).toBe(contract.versionId);
    expect(JSON.stringify(row)).not.toContain(token); // nenhum campo guarda o token puro

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: contract.id } });
    expect(audit).toMatchObject({ actorId: f.userId, action: 'gerou link de aceite eletrônico do' });
  });

  it('usuário sem permissão (ASSISTANT) → 403; sem login → 401', async () => {
    const { f, contract } = await setup();
    const assistant = await createFixtureUser({ officeId: f.officeId, role: 'ASSISTANT' });
    const res = await app.inject({ method: 'POST', url: `/contracts/${contract.id}/signature-links`, headers: await login(assistant) });
    expect(res.statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/contracts/${contract.id}/signature-links` })).statusCode).toBe(401);
    expect(await prisma.contractPublicSignature.count()).toBe(0);
  });

  it('isolamento entre escritórios: contrato de outro escritório → 404 (sem IDOR)', async () => {
    const a = await setup();
    const b = await setup();
    const { res } = await generate(b.auth, a.contract.id);
    expect(res.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/contracts/${a.contract.id}/signatures`, headers: b.auth })).statusCode).toBe(404);
  });

  it('status que não permite aceite → 409 (RASCUNHO/PRONTO_ENVIO/ATIVO)', async () => {
    for (const status of ['PRONTO_ENVIO', 'ATIVO'] as const) {
      const { contract, auth } = await setup(status);
      expect((await generate(auth, contract.id)).res.statusCode).toBe(409);
    }
  });

  it('novo link invalida o anterior', async () => {
    const { contract, auth } = await setup();
    const first = await generate(auth, contract.id);
    const second = await generate(auth, contract.id);

    expect((await app.inject({ method: 'GET', url: `/public/signatures/${first.token}` })).statusCode).toBe(410);
    expect((await app.inject({ method: 'GET', url: `/public/signatures/${second.token}` })).statusCode).toBe(200);
  });

  // ---- token válido / inválido ------------------------------------------

  it('token válido: devolve só dados necessários e não cacheia', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    const res = await app.inject({ method: 'GET', url: `/public/signatures/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const view = res.json();
    expect(view.contract).toMatchObject({ number: contract.number, clientName: 'Cliente de Teste', value: 5000 });
    expect(view.version).toMatchObject({ versionNumber: 1, content: 'Texto da versão 1 do contrato.' });
    expect(view.singleUse).toBe(true);
    const raw = res.body;
    for (const forbidden of ['officeId', 'tokenHash', 'passwordHash', 'responsibleId', token]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('token inválido/aleatório → 404 genérico (mesma resposta, sem enumeração)', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/public/signatures/token-que-nao-existe' });
    const r2 = await app.inject({ method: 'GET', url: `/public/signatures/${'A'.repeat(43)}` });
    expect(r1.statusCode).toBe(404);
    expect(r2.statusCode).toBe(404);
    expect(r1.json().error.message).toBe(r2.json().error.message);
    expect((await sign('token-que-nao-existe')).statusCode).toBe(404);
  });

  it('o hash do token (tokenHash) NÃO funciona como token', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);
    expect((await app.inject({ method: 'GET', url: `/public/signatures/${sha256(token)}` })).statusCode).toBe(404);
  });

  it('token de outro contrato assina apenas o próprio contrato', async () => {
    const a = await setup();
    const b = await setup();
    const ta = await generate(a.auth, a.contract.id);
    await generate(b.auth, b.contract.id);

    expect((await sign(ta.token)).statusCode).toBe(201);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: a.contract.id } })).status).toBe('ASSINADO');
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: b.contract.id } })).status).toBe('ENVIADO');
  });

  // ---- expiração / uso único ---------------------------------------------

  it('token expirado → 410 SIGNATURE_LINK_EXPIRED, em GET e POST, sem assinar', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);
    await prisma.contractPublicSignature.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const get = await app.inject({ method: 'GET', url: `/public/signatures/${token}` });
    expect(get.statusCode).toBe(410);
    expect(get.json().error.code).toBe('SIGNATURE_LINK_EXPIRED');
    expect(get.body).not.toContain('Texto da versão'); // sem conteúdo do contrato

    expect((await sign(token)).statusCode).toBe(410);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe('ENVIADO');
  });

  it('assinatura válida: muda status, grava hash correto, auditoria "Sistema" e notifica o responsável', async () => {
    const { f, contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    const res = await sign(token);
    expect(res.statusCode).toBe(201);
    const result = res.json();
    expect(result).toMatchObject({ signed: true, signerName: 'Maria da Silva', contractNumber: contract.number });
    expect(res.body).not.toContain(token);

    const row = await prisma.contractPublicSignature.findFirstOrThrow({ where: { contractId: contract.id } });
    expect(row.usedAt).not.toBeNull();
    expect(row.signerDocument).toBe('52998224725');
    expect(row.signatureHash).toBe(result.signatureHash);
    expect(row.consentTextVersion).toBeTruthy();

    // hash SHA-256 recalculável a partir dos campos gravados (sem o token)
    const expected = computeSignatureHash({
      signatureId: row.id,
      contractId: row.contractId,
      contractVersionId: row.contractVersionId,
      versionNumber: 1,
      contentHash: sha256('Texto da versão 1 do contrato.'),
      signerName: row.signerName!,
      signerDocument: row.signerDocument!,
      signerIp: row.signerIp,
      signedAt: row.signedAt!,
      consentTextVersion: row.consentTextVersion!,
    });
    expect(row.signatureHash).toBe(expected);
    expect(row.signatureHash).toMatch(/^[0-9a-f]{64}$/);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'assinou eletronicamente' } });
    expect(audit).toMatchObject({ actorId: null, actorLabel: 'Sistema', entityType: 'Contract', entityId: contract.id, entityLabel: `Contrato #${contract.number}` });
    expect(JSON.stringify(audit)).not.toContain('52998224725');
    expect(JSON.stringify(audit)).not.toContain(token);

    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: f.userId } });
    expect(notification.title).toBe('Contrato assinado eletronicamente');
  });

  it('token já utilizado → 410 SIGNATURE_LINK_USED (GET e POST) e não gera 2ª assinatura', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);
    expect((await sign(token)).statusCode).toBe(201);

    const get = await app.inject({ method: 'GET', url: `/public/signatures/${token}` });
    expect(get.statusCode).toBe(410);
    expect(get.json().error.code).toBe('SIGNATURE_LINK_USED');
    const replay = await sign(token, { signerName: 'Outra Pessoa' });
    expect(replay.statusCode).toBe(410);

    const rows = await prisma.contractPublicSignature.findMany({ where: { contractId: contract.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.signerName).toBe('Maria da Silva');
    expect(await prisma.auditLog.count({ where: { action: 'assinou eletronicamente' } })).toBe(1);
  });

  it('assinaturas simultâneas do mesmo token: exatamente UMA é aceita', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => sign(token, { signerName: `Pessoa Numero ${i}` })));
    const codes = responses.map((r) => r.statusCode).sort();

    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 410)).toHaveLength(7);
    expect(await prisma.auditLog.count({ where: { action: 'assinou eletronicamente' } })).toBe(1);
    expect((await prisma.contractPublicSignature.findMany({ where: { usedAt: { not: null } } }))).toHaveLength(1);
  });

  // ---- IP / data vindos só do backend --------------------------------------

  it('IP vem do backend (request.ip) e signedAt do servidor; body.ip/signedAt são ignorados', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    const before = Date.now();
    const res = await sign(token, { ip: '6.6.6.6', signerIp: '6.6.6.6', signedAt: '1999-01-01T00:00:00.000Z' }, '203.0.113.9', { 'user-agent': 'TestAgent/1.0' });
    expect(res.statusCode).toBe(201);

    const row = await prisma.contractPublicSignature.findFirstOrThrow({ where: { contractId: contract.id } });
    expect(row.signerIp).toBe('203.0.113.9');
    expect(row.signerUserAgent).toBe('TestAgent/1.0');
    expect(row.signedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.signedAt!.getFullYear()).not.toBe(1999);
  });

  it('com trustProxy, o IP é o do X-Forwarded-For definido pelo proxy (não um campo do body)', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    await sign(token, { ip: '6.6.6.6' }, '10.0.0.1', { 'x-forwarded-for': '198.51.100.20' });
    const row = await prisma.contractPublicSignature.findFirstOrThrow({ where: { contractId: contract.id } });
    expect(row.signerIp).toBe('198.51.100.20');
  });

  // ---- validação do corpo ---------------------------------------------------

  it('rejeita CPF/CNPJ inválido, nome curto e consentimento ausente — sem consumir o link', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    expect((await sign(token, { signerDocument: '111.111.111-11' })).statusCode).toBe(400);
    expect((await sign(token, { signerName: 'Al' })).statusCode).toBe(400);
    expect((await sign(token, { consent: false })).statusCode).toBe(400);
    expect((await sign(token, { consent: undefined })).statusCode).toBe(400);

    expect((await prisma.contractPublicSignature.findFirstOrThrow()).usedAt).toBeNull();
    expect((await sign(token)).statusCode).toBe(201); // ainda utilizável
  });

  // ---- versão do contrato -----------------------------------------------------

  it('o link mostra e vincula a versão para a qual foi gerado', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    const view = (await app.inject({ method: 'GET', url: `/public/signatures/${token}` })).json();
    expect(view.version.versionNumber).toBe(1);

    await sign(token);
    const row = await prisma.contractPublicSignature.findFirstOrThrow();
    expect(row.contractVersionId).toBe(contract.versionId);
  });

  it('contrato alterado depois da geração (nova versão) invalida o link — nunca aceita versão diferente', async () => {
    const { f, contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);

    await prisma.contractVersion.create({
      data: { contractId: contract.id, versionNumber: 2, content: 'Texto ALTERADO da versão 2.', authorId: f.userId },
    });

    const get = await app.inject({ method: 'GET', url: `/public/signatures/${token}` });
    expect(get.statusCode).toBe(410);
    expect(get.body).not.toContain('ALTERADO');
    expect((await sign(token)).statusCode).toBe(410);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe('ENVIADO');
    expect((await prisma.contractPublicSignature.findFirstOrThrow()).usedAt).toBeNull();

    // um novo link aponta para a versão 2
    const second = await generate(auth, contract.id);
    const view = (await app.inject({ method: 'GET', url: `/public/signatures/${second.token}` })).json();
    expect(view.version).toMatchObject({ versionNumber: 2, content: 'Texto ALTERADO da versão 2.' });
  });

  it('contrato que mudou de status após a geração (ex.: CANCELADO) invalida o link e não é assinado', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);
    await prisma.contract.update({ where: { id: contract.id }, data: { status: 'CANCELADO' } });

    expect((await app.inject({ method: 'GET', url: `/public/signatures/${token}` })).statusCode).toBe(410);
    expect((await sign(token)).statusCode).toBe(410);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe('CANCELADO');
  });

  it('EM_REVISAO também pode ser assinado', async () => {
    const { contract, auth } = await setup('EM_REVISAO');
    const { token } = await generate(auth, contract.id);
    expect((await sign(token)).statusCode).toBe(201);
  });

  // ---- histórico ----------------------------------------------------------------

  it('histórico do contrato não expõe token nem tokenHash e mascara o documento', async () => {
    const { contract, auth } = await setup();
    const { token } = await generate(auth, contract.id);
    await sign(token);

    const res = await app.inject({ method: 'GET', url: `/contracts/${contract.id}/signatures`, headers: auth });
    expect(res.statusCode).toBe(200);
    const [record] = res.json().data;
    expect(record).toMatchObject({ state: 'used', versionNumber: 1, signerName: 'Maria da Silva', signerDocumentMasked: '*********25' });
    expect(res.body).not.toContain('tokenHash');
    expect(res.body).not.toContain(token);
    expect(res.body).not.toContain('52998224725');
  });
});

describe('rate limit dos endpoints públicos de aceite', () => {
  it('bloqueia com 429 após exceder o limite e não afeta rotas autenticadas', async () => {
    const app = buildApp({ publicSignatureRateLimit: { max: 3, timeWindow: '1 minute' } });
    await app.ready();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await app.inject({ method: 'GET', url: '/public/signatures/chute-qualquer', remoteAddress: '198.51.100.50' })).statusCode);
      }
      expect(statuses.slice(0, 3)).toEqual([404, 404, 404]);
      expect(statuses.slice(3)).toEqual([429, 429]);

      // outro IP não é afetado
      expect((await app.inject({ method: 'GET', url: '/public/signatures/chute-qualquer', remoteAddress: '198.51.100.51' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
