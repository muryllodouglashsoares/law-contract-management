import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { absolutePath } from '../../src/shared/storage/local-file-storage';
import { createFixtureClientAndTemplate, createFixtureUser, resetDatabase, type TestFixture } from './helpers/db';

const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

describe('POST /contracts/:id/pdf', () => {
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

  async function login(fixture: TestFixture): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: fixture.email, password: fixture.password },
    });
    return response.json().accessToken;
  }

  /** Escritório + usuário logado + contrato (versão 1) já criados pela API. */
  async function setup(role: 'ADMIN' | 'LAWYER' | 'ASSISTANT' = 'ADMIN') {
    const fixture = await createFixtureUser({ role });
    const token = await login(fixture);
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    // Contratos são criados por ADMIN/LAWYER; um ASSISTANT só lê/gera PDF.
    const creator = role === 'ASSISTANT' ? await createFixtureAdminInOffice(fixture.officeId) : { token };
    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${creator.token}` },
      payload: { clientId, templateId, value: 5000, object: 'Consultoria jurídica mensal', startDate: '2026-01-15' },
    });
    expect(created.statusCode).toBe(201);
    return { fixture, token, creatorToken: creator.token, contractId: created.json().contract.id as string };
  }

  async function createFixtureAdminInOffice(officeId: string): Promise<{ token: string }> {
    const { hashPassword } = await import('../../src/shared/auth/password');
    const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await prisma.user.create({
      data: { officeId, name: 'Admin', email, passwordHash: await hashPassword('Senha@123'), role: 'ADMIN', status: 'ACTIVE' },
    });
    const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'Senha@123' } });
    return { token: response.json().accessToken };
  }

  const generate = (token: string, contractId: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/pdf`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });

  it('exige autenticação', async () => {
    const response = await app.inject({ method: 'POST', url: `/contracts/${RANDOM_UUID}/pdf` });
    expect(response.statusCode).toBe(401);
  });

  it('gera o PDF da versão atual, salva o arquivo e cria o Document', async () => {
    const { token, contractId, fixture } = await setup();

    const response = await generate(token, contractId);

    expect(response.statusCode).toBe(201);
    const { document, created } = response.json();
    expect(created).toBe(true);
    expect(document).toMatchObject({
      fileType: 'PDF',
      mimeType: 'application/pdf',
      category: 'contrato',
      versionNumber: 1,
      contract: { id: contractId },
    });
    expect(document.fileName).toMatch(/^Contrato_\d+_v1\.pdf$/);
    expect(document.sizeBytes).toBeGreaterThan(0);

    // Arquivo real no storage, com estrutura mínima de PDF.
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row.officeId).toBe(fixture.officeId);
    expect(row.contractVersionId).not.toBeNull();
    const file = await readFile(absolutePath(row.storagePath));
    expect(file.byteLength).toBe(document.sizeBytes);
    expect(file.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(file.subarray(-32).toString('latin1')).toContain('%%EOF');
  });

  it('registra a geração na auditoria do contrato', async () => {
    const { token, contractId } = await setup();
    await generate(token, contractId);

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Contract', entityId: contractId, action: 'gerou o PDF do' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entityLabel).toMatch(/^Contrato #\d+$/);
    expect(logs[0]?.actorId).not.toBeNull();
  });

  it('reutiliza o PDF quando a mesma versão já foi gerada (200, sem duplicar)', async () => {
    const { token, contractId } = await setup();

    const first = await generate(token, contractId);
    const second = await generate(token, contractId);

    expect(second.statusCode).toBe(200);
    expect(second.json().created).toBe(false);
    expect(second.json().document.id).toBe(first.json().document.id);
    expect(await prisma.document.count({ where: { contractId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'gerou o PDF do' } })).toBe(1);
  });

  it('não duplica quando várias requisições geram a mesma versão ao mesmo tempo', async () => {
    const { token, contractId } = await setup();

    const responses = await Promise.all([1, 2, 3, 4].map(() => generate(token, contractId)));

    expect(responses.every((r) => [200, 201].includes(r.statusCode))).toBe(true);
    expect(new Set(responses.map((r) => r.json().document.id)).size).toBe(1);
    expect(await prisma.document.count({ where: { contractId } })).toBe(1);
  });

  it('retorna 404 para contrato inexistente e 400 para id inválido', async () => {
    const { token } = await setup();

    expect((await generate(token, RANDOM_UUID)).statusCode).toBe(404);
    expect((await generate(token, 'nao-e-uuid')).statusCode).toBe(400);
  });

  it('retorna 404 para contrato de outro escritório e não gera nada', async () => {
    const mine = await setup();
    const other = await setup();

    const response = await generate(mine.token, other.contractId);

    expect(response.statusCode).toBe(404);
    expect(await prisma.document.count()).toBe(0);
  });

  it('retorna 404 para versão inexistente e 400 para versionNumber inválido', async () => {
    const { token, contractId } = await setup();

    expect((await generate(token, contractId, { versionNumber: 99 })).statusCode).toBe(404);
    expect((await generate(token, contractId, { versionNumber: 0 })).statusCode).toBe(400);
    expect((await generate(token, contractId, { versionNumber: 'abc' })).statusCode).toBe(400);
  });

  it('não permite gerar PDF de uma versão que pertence a outro contrato', async () => {
    const { token, creatorToken, contractId: contractA, fixture } = await setup();
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);

    // Contrato A ganha a versão 2; contrato B só tem a versão 1.
    await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractA}`,
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { value: 7000 },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { clientId, templateId, value: 100, object: 'Outro contrato', startDate: '2026-02-01' },
    });
    const contractB = b.json().contract.id as string;

    const response = await generate(token, contractB, { versionNumber: 2 });

    expect(response.statusCode).toBe(404);
    expect(await prisma.document.count({ where: { contractId: contractB } })).toBe(0);
  });

  it('cada versão gera seu próprio PDF e o PDF antigo não muda quando o contrato é editado', async () => {
    const { token, creatorToken, contractId } = await setup();

    const v1 = (await generate(token, contractId)).json().document;
    const v1Bytes = await readFile(absolutePath((await prisma.document.findUniqueOrThrow({ where: { id: v1.id } })).storagePath));

    const edit = await app.inject({
      method: 'PATCH',
      url: `/contracts/${contractId}`,
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { object: 'Objeto alterado após o primeiro PDF' },
    });
    expect(edit.statusCode).toBe(200);

    const v2Response = await generate(token, contractId);
    expect(v2Response.statusCode).toBe(201);
    const v2 = v2Response.json().document;
    expect(v2.versionNumber).toBe(2);
    expect(v2.fileName).toMatch(/_v2\.pdf$/);
    expect(v2.id).not.toBe(v1.id);

    // Pedir a v1 de novo devolve o PDF original, byte a byte.
    const v1Again = await generate(token, contractId, { versionNumber: 1 });
    expect(v1Again.json().document.id).toBe(v1.id);
    const v1Row = await prisma.document.findUniqueOrThrow({ where: { id: v1.id } });
    expect((await readFile(absolutePath(v1Row.storagePath))).equals(v1Bytes)).toBe(true);

    // Cada Document aponta para a versão que o originou.
    const versions = await prisma.contractVersion.findMany({ where: { contractId }, orderBy: { versionNumber: 'asc' } });
    const rows = await prisma.document.findMany({ where: { contractId } });
    expect(rows.find((r) => r.id === v1.id)?.contractVersionId).toBe(versions[0]?.id);
    expect(rows.find((r) => r.id === v2.id)?.contractVersionId).toBe(versions[1]?.id);
  });

  it('permite que um ASSISTANT gere o PDF (mesma regra do upload de documentos)', async () => {
    const { token, contractId } = await setup('ASSISTANT');
    expect((await generate(token, contractId)).statusCode).toBe(201);
  });

  it('o PDF aparece em /documents, baixa como application/pdf e é privado por escritório', async () => {
    const { token, contractId } = await setup();
    const other = await setup();
    const { document } = (await generate(token, contractId)).json();

    const list = await app.inject({
      method: 'GET',
      url: `/documents?contractId=${contractId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0]).toMatchObject({ id: document.id, versionNumber: 1, category: 'contrato' });

    const download = await app.inject({
      method: 'GET',
      url: `/documents/${document.id}/download`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const foreign = await app.inject({
      method: 'GET',
      url: `/documents/${document.id}/download`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(foreign.statusCode).toBe(404);
  });
});
