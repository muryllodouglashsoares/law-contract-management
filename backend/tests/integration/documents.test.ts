import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { getStorage } from '../../src/shared/storage';
import { createFixtureClientAndTemplate, createFixtureUser, resetDatabase } from './helpers/db';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

/** Monta um corpo multipart/form-data (app.inject não tem FormData). */
function multipart(fields: Record<string, string>, file?: { name: string; type: string; content: Buffer }) {
  const boundary = '----lextest' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
      file.content,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('/documents (upload, download, remoção e isolamento por escritório)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    await resetDatabase();
  });
  afterEach(() => resetDatabase());
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Escritório + ADMIN logado + contrato criado pela API. */
  async function setup() {
    const fixture = await createFixtureUser({ role: 'ADMIN' });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: fixture.email, password: fixture.password } });
    const token = login.json().accessToken as string;
    const { clientId, templateId } = await createFixtureClientAndTemplate(fixture.officeId);
    const created = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { clientId, templateId, value: 1000, object: 'Objeto do contrato', startDate: '2026-01-15' },
    });
    expect(created.statusCode).toBe(201);
    return { fixture, token, contractId: created.json().contract.id as string };
  }

  const upload = (
    token: string | undefined,
    contractId: string,
    file?: { name: string; type: string; content: Buffer },
  ) => {
    const { payload, contentType } = multipart({ contractId }, file);
    return app.inject({
      method: 'POST',
      url: '/documents',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': contentType },
      payload,
    });
  };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const validFile = { name: 'procuração.pdf', type: 'application/pdf', content: PDF };

  it('exige autenticação', async () => {
    const { contractId } = await setup();
    expect((await upload(undefined, contractId, validFile)).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/documents/${RANDOM_UUID}/download` })).statusCode).toBe(401);
  });

  it('upload válido: grava no storage em {officeId}/{uuid}.pdf e baixa o mesmo conteúdo', async () => {
    const { fixture, token, contractId } = await setup();

    const response = await upload(token, contractId, validFile);
    expect(response.statusCode).toBe(201);
    const { document } = response.json();
    expect(document).toMatchObject({ fileName: 'procuração.pdf', mimeType: 'application/pdf', fileType: 'PDF', sizeBytes: PDF.byteLength });

    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row.storagePath).toMatch(new RegExp(`^${fixture.officeId}/[0-9a-f-]{36}\\.pdf$`));
    expect(await getStorage().exists(row.storagePath)).toBe(true);

    const download = await app.inject({ method: 'GET', url: `/documents/${document.id}/download`, headers: auth(token) });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toContain(encodeURIComponent('procuração.pdf'));
    expect(download.headers['cache-control']).toContain('no-store');
    expect(download.rawPayload.equals(PDF)).toBe(true);
  });

  it('isolamento: outro escritório não baixa, não remove e não envia para contrato alheio', async () => {
    const a = await setup();
    const b = await setup();
    const { document } = (await upload(a.token, a.contractId, validFile)).json();

    const foreignDownload = await app.inject({ method: 'GET', url: `/documents/${document.id}/download`, headers: auth(b.token) });
    const foreignDelete = await app.inject({ method: 'DELETE', url: `/documents/${document.id}`, headers: auth(b.token) });
    const foreignUpload = await upload(b.token, a.contractId, validFile);
    const ownDownload = await app.inject({ method: 'GET', url: `/documents/${document.id}/download`, headers: auth(a.token) });

    expect(foreignDownload.statusCode).toBe(404);
    expect(foreignDelete.statusCode).toBe(404);
    expect(foreignUpload.statusCode).toBe(404);
    expect(ownDownload.statusCode).toBe(200);
    expect(await prisma.document.count()).toBe(1);
  });

  it('rejeita executável renomeado para .pdf, extensão proibida e arquivo ausente (400), sem criar Document', async () => {
    const { token, contractId } = await setup();

    const fake = await upload(token, contractId, { name: 'virus.pdf', type: 'application/pdf', content: Buffer.from('MZ\x90\x00 executável') });
    const exe = await upload(token, contractId, { name: 'setup.exe', type: 'application/octet-stream', content: Buffer.from('MZ') });
    const mismatch = await upload(token, contractId, { name: 'a.pdf', type: 'image/png', content: PDF });
    const none = await upload(token, contractId);

    for (const response of [fake, exe, mismatch, none]) expect(response.statusCode).toBe(400);
    expect(await prisma.document.count()).toBe(0);
  });

  it('rejeita arquivo acima do limite (400), sem salvar', async () => {
    const { fixture, token, contractId } = await setup();
    const tooBig = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

    const response = await upload(token, contractId, { name: 'grande.pdf', type: 'application/pdf', content: tooBig });

    expect(response.statusCode).toBe(400);
    expect(await prisma.document.count({ where: { officeId: fixture.officeId } })).toBe(0);
  });

  it('remove o registro e o objeto do storage', async () => {
    const { token, contractId } = await setup();
    const { document } = (await upload(token, contractId, validFile)).json();
    const { storagePath } = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });

    const response = await app.inject({ method: 'DELETE', url: `/documents/${document.id}`, headers: auth(token) });

    expect(response.statusCode).toBe(204);
    expect(await prisma.document.count()).toBe(0);
    expect(await getStorage().exists(storagePath)).toBe(false);
  });
});
