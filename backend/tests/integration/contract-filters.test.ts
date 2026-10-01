import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { createFixtureClientAndTemplate, createFixtureContract, createFixtureUser, resetDatabase } from './helpers/db';

describe('GET /contracts — filtros avançados', () => {
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

  async function setup() {
    const f = await createFixtureUser();
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: f.email, password: f.password } });
    const token: string = login.json().accessToken;
    const d = (s: string) => new Date(`${s}T00:00:00Z`);

    const ids = await createFixtureClientAndTemplate(f.officeId);
    const other = await createFixtureClientAndTemplate(f.officeId);

    const c1 = await createFixtureContract(f.officeId, f.userId, { ...ids, status: 'ATIVO', value: 3000, startDate: d('2026-01-10'), endDate: d('2026-06-30'), object: 'Consultoria alfa' });
    const c2 = await createFixtureContract(f.officeId, f.userId, { ...ids, status: 'ATIVO', value: 8000, startDate: d('2026-03-01'), endDate: d('2026-10-15'), object: 'Consultoria beta' });
    const c3 = await createFixtureContract(f.officeId, f.userId, { ...other, status: 'ATIVO', value: 15000, startDate: d('2026-05-01'), endDate: d('2026-10-20'), object: 'Contencioso gama' });
    const c4 = await createFixtureContract(f.officeId, f.userId, { ...other, status: 'ENVIADO', value: 8000, startDate: d('2026-07-01'), endDate: null, object: 'Parecer delta' });

    const list = async (qs: string) => {
      const response = await app.inject({ method: 'GET', url: `/contracts?${qs}`, headers: { authorization: `Bearer ${token}` } });
      return { status: response.statusCode, body: response.json() as { data: { id: string }[]; pagination?: { total: number }; error?: unknown } };
    };
    const idsOf = async (qs: string) => (await list(qs)).body.data.map((c) => c.id).sort();
    return { f, c1, c2, c3, c4, ids, other, list, idsOf, sorted: (...xs: { id: string }[]) => xs.map((x) => x.id).sort() };
  }

  it('sem filtros continua listando tudo (compatibilidade)', async () => {
    const s = await setup();
    expect(await s.idsOf('')).toEqual(s.sorted(s.c1, s.c2, s.c3, s.c4));
  });

  it('valueMin / valueMax (inclusivos)', async () => {
    const s = await setup();
    expect(await s.idsOf('valueMin=8000')).toEqual(s.sorted(s.c2, s.c3, s.c4));
    expect(await s.idsOf('valueMax=8000')).toEqual(s.sorted(s.c1, s.c2, s.c4));
    expect(await s.idsOf('valueMin=5000&valueMax=10000')).toEqual(s.sorted(s.c2, s.c4));
  });

  it('período de início e de término (contrato sem endDate não casa com filtro de término)', async () => {
    const s = await setup();
    expect(await s.idsOf('startDateFrom=2026-03-01&startDateTo=2026-05-01')).toEqual(s.sorted(s.c2, s.c3));
    expect(await s.idsOf('endDateFrom=2026-10-01&endDateTo=2026-10-31')).toEqual(s.sorted(s.c2, s.c3));
    expect(await s.idsOf('endDateTo=2026-12-31')).toEqual(s.sorted(s.c1, s.c2, s.c3)); // c4 (sem término) fora
  });

  it('cliente', async () => {
    const s = await setup();
    expect(await s.idsOf(`clientId=${s.other.clientId}`)).toEqual(s.sorted(s.c3, s.c4));
  });

  it('filtros combinados (status + término + valor) e junto com a busca textual', async () => {
    const s = await setup();
    expect(await s.idsOf('status=ativo&endDateFrom=2026-10-01&endDateTo=2026-10-31&valueMin=5000&valueMax=20000')).toEqual(s.sorted(s.c2, s.c3));
    expect(await s.idsOf('status=ativo&endDateFrom=2026-10-01&endDateTo=2026-10-31&valueMin=10000')).toEqual(s.sorted(s.c3));
    expect(await s.idsOf('status=ativo&valueMin=5000&search=beta')).toEqual(s.sorted(s.c2));
    expect(await s.idsOf(`status=ativo&clientId=${s.other.clientId}`)).toEqual(s.sorted(s.c3));
  });

  it('paginação reflete o total filtrado', async () => {
    const s = await setup();
    const { body } = await s.list('valueMin=5000&pageSize=1&page=2');
    expect(body.pagination?.total).toBe(3);
    expect(body.data).toHaveLength(1);
  });

  it('valueMin > valueMax e datas inválidas → 400', async () => {
    const s = await setup();
    expect((await s.list('valueMin=100&valueMax=10')).status).toBe(400);
    expect((await s.list('startDateFrom=abc')).status).toBe(400);
    expect((await s.list('endDateFrom=2026-12-01&endDateTo=2026-01-01')).status).toBe(400);
    expect((await s.list('valueMin=-5')).status).toBe(400);
  });

  it('não vaza contratos de outro escritório', async () => {
    const s = await setup();
    const foreign = await createFixtureUser();
    await createFixtureContract(foreign.officeId, foreign.userId, { status: 'ATIVO', value: 9000 });
    expect(await s.idsOf('valueMin=5000')).toEqual(s.sorted(s.c2, s.c3, s.c4));
  });
});

describe('endDate na criação/edição de contratos (API)', () => {
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

  it('cria com endDate, rejeita término < início, edita e remove; contratos sem endDate seguem válidos', async () => {
    const f = await createFixtureUser();
    const { clientId, templateId } = await createFixtureClientAndTemplate(f.officeId);
    const token = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: f.email, password: f.password } })).json().accessToken;
    const auth = { authorization: `Bearer ${token}` };
    const body = { clientId, templateId, value: 1000, object: 'Objeto do contrato', startDate: '2026-03-01' };

    const bad = await app.inject({ method: 'POST', url: '/contracts', headers: auth, payload: { ...body, endDate: '2026-02-01' } });
    expect(bad.statusCode).toBe(400);

    const created = await app.inject({ method: 'POST', url: '/contracts', headers: auth, payload: { ...body, endDate: '2026-12-31' } });
    expect(created.statusCode).toBe(201);
    const contract = created.json().contract;
    expect(contract.endDate).toBe('2026-12-31T00:00:00.000Z');

    // término anterior ao início persistido (só endDate enviado) → 400 vindo do service
    const early = await app.inject({ method: 'PATCH', url: `/contracts/${contract.id}`, headers: auth, payload: { endDate: '2026-01-01' } });
    expect(early.statusCode).toBe(400);

    // mover o início para depois do término persistido → 400
    const late = await app.inject({ method: 'PATCH', url: `/contracts/${contract.id}`, headers: auth, payload: { startDate: '2027-06-01' } });
    expect(late.statusCode).toBe(400);

    const ok = await app.inject({ method: 'PATCH', url: `/contracts/${contract.id}`, headers: auth, payload: { endDate: '2027-01-31' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().contract.endDate).toBe('2027-01-31T00:00:00.000Z');

    const cleared = await app.inject({ method: 'PATCH', url: `/contracts/${contract.id}`, headers: auth, payload: { endDate: null } });
    expect(cleared.json().contract.endDate).toBeNull();

    const legacy = await app.inject({ method: 'POST', url: '/contracts', headers: auth, payload: body });
    expect(legacy.statusCode).toBe(201);
    expect(legacy.json().contract.endDate).toBeNull();
  });
});
