import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { prisma } from '../../src/shared/database/prisma';
import { totpAt, totpStep } from '../../src/shared/security/two-factor';
import { createFixtureClientAndTemplate, createFixtureUser, resetDatabase } from './helpers/db';

/**
 * Integração dos recursos de alertas/financeiro/aprovação/2FA. Exigem PostgreSQL (DATABASE_URL) com as
 * migrations aplicadas, como os demais testes desta pasta.
 */
async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  return response.json().accessToken;
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function createContract(app: FastifyInstance, token: string, officeId: string, overrides: Record<string, unknown> = {}) {
  const { clientId, templateId } = await createFixtureClientAndTemplate(officeId);
  const res = await app.inject({
    method: 'POST', url: '/contracts', headers: auth(token),
    payload: { clientId, templateId, value: 100, object: 'Objeto', startDate: '2026-01-01', ...overrides },
  });
  expect(res.statusCode).toBe(201);
  return res.json().contract.id as string;
}

describe('recursos novos (integração)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp(); await app.ready(); await resetDatabase(); });
  afterEach(async () => { await resetDatabase(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  // --- Preferências ---------------------------------------------------------
  it('preferências de notificação: padrões, PATCH parcial persistido e isolado por usuário', async () => {
    const a = await createFixtureUser();
    const b = await createFixtureUser({ officeId: a.officeId, role: 'LAWYER' });
    const tokenA = await login(app, a.email, a.password);
    const tokenB = await login(app, b.email, b.password);

    const initial = await app.inject({ method: 'GET', url: '/users/me/notification-preferences', headers: auth(tokenA) });
    expect(initial.json().preferences).toEqual({ emailEnabled: true, whatsappEnabled: false, pushEnabled: true });

    const patched = await app.inject({ method: 'PATCH', url: '/users/me/notification-preferences', headers: auth(tokenA), payload: { emailEnabled: false, whatsappEnabled: true } });
    expect(patched.json().preferences).toEqual({ emailEnabled: false, whatsappEnabled: true, pushEnabled: true });

    // "restaura após logout/login": nova sessão lê o mesmo estado
    const again = await login(app, a.email, a.password);
    const reread = await app.inject({ method: 'GET', url: '/users/me/notification-preferences', headers: auth(again) });
    expect(reread.json().preferences.emailEnabled).toBe(false);

    const other = await app.inject({ method: 'GET', url: '/users/me/notification-preferences', headers: auth(tokenB) });
    expect(other.json().preferences.emailEnabled).toBe(true);

    const empty = await app.inject({ method: 'PATCH', url: '/users/me/notification-preferences', headers: auth(tokenA), payload: {} });
    expect(empty.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/users/me/notification-preferences' })).statusCode).toBe(401);
  });

  // --- Parcelas ---------------------------------------------------------------
  it('gera parcelas atomicamente: soma exata, dia preservado, bloqueio de duplicidade e isolamento por escritório', async () => {
    const f = await createFixtureUser();
    const token = await login(app, f.email, f.password);
    const contractId = await createContract(app, token, f.officeId);
    const body = { contractId, totalValue: 100, installmentCount: 3, firstDueDate: '2027-01-31' };

    const preview = await app.inject({ method: 'POST', url: '/payments/installments/preview', headers: auth(token), payload: body });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().installments.map((i: { value: number }) => i.value)).toEqual([33.34, 33.33, 33.33]);
    expect(preview.json().installments.map((i: { dueDate: string }) => i.dueDate.slice(0, 10))).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(await prisma.payment.count()).toBe(0); // prévia não grava

    const generated = await app.inject({ method: 'POST', url: '/payments/installments/generate', headers: auth(token), payload: body });
    expect(generated.statusCode).toBe(201);
    const rows = await prisma.payment.findMany({ where: { contractId }, orderBy: { installmentNumber: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, r) => sum + Math.round(Number(r.value) * 100), 0)).toBe(10000);
    expect(await prisma.auditLog.count({ where: { action: 'gerou as parcelas do' } })).toBe(1);

    const duplicate = await app.inject({ method: 'POST', url: '/payments/installments/generate', headers: auth(token), payload: body });
    expect(duplicate.statusCode).toBe(409);
    expect(await prisma.payment.count({ where: { contractId } })).toBe(3);

    const intruder = await createFixtureUser();
    const intruderToken = await login(app, intruder.email, intruder.password);
    const foreign = await app.inject({ method: 'POST', url: '/payments/installments/generate', headers: auth(intruderToken), payload: body });
    expect(foreign.statusCode).toBe(404);

    const invalid = await app.inject({ method: 'POST', url: '/payments/installments/generate', headers: auth(token), payload: { ...body, totalValue: -5 } });
    expect(invalid.statusCode).toBe(400);
  });

  it('gerações simultâneas criam o parcelamento uma única vez', async () => {
    const f = await createFixtureUser();
    const token = await login(app, f.email, f.password);
    const contractId = await createContract(app, token, f.officeId);
    const body = { contractId, totalValue: 1200, installmentCount: 12, firstDueDate: '2027-01-10' };
    const results = await Promise.all([1, 2, 3].map(() => app.inject({ method: 'POST', url: '/payments/installments/generate', headers: auth(token), payload: body })));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(await prisma.payment.count({ where: { contractId } })).toBe(12);
  });

  // --- Pix --------------------------------------------------------------------
  it('Pix: valida o BR Code e NÃO baixa a parcela; a baixa via PIX é manual e auditada', async () => {
    const f = await createFixtureUser();
    const token = await login(app, f.email, f.password);
    const contractId = await createContract(app, token, f.officeId);
    const created = await app.inject({ method: 'POST', url: '/payments', headers: auth(token), payload: { contractId, installmentNumber: 1, installmentTotal: 1, value: 100, dueDate: '2027-01-10' } });
    const paymentId = created.json().payment.id as string;

    const bad = await app.inject({ method: 'PATCH', url: `/payments/${paymentId}`, headers: auth(token), payload: { pixCode: 'qualquer-coisa' } });
    expect(bad.statusCode).toBe(400);

    const { crc16Ccitt } = await import('../../src/shared/utils/pix');
    const body = '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913Escritorio X6009SAO PAULO62070503***6304';
    const pixCode = body + crc16Ccitt(body);
    const saved = await app.inject({ method: 'PATCH', url: `/payments/${paymentId}`, headers: auth(token), payload: { pixCode, pixKey: 'chave@x.com' } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().payment.pixCode).toBe(pixCode);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING');

    const paid = await app.inject({ method: 'POST', url: `/payments/${paymentId}/register`, headers: auth(token), payload: { method: 'PIX' } });
    expect(paid.statusCode).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PAID');
    expect(await prisma.auditLog.count({ where: { action: 'registrou pagamento via PIX de' } })).toBe(1);
  });

  // --- Renovação --------------------------------------------------------------
  it('renova com reajuste: nova versão, valor/endDate novos e ciclo de alertas reiniciado', async () => {
    const f = await createFixtureUser();
    const token = await login(app, f.email, f.password);
    const contractId = await createContract(app, token, f.officeId, { value: 1000, endDate: '2026-11-01' });
    await prisma.contract.update({ where: { id: contractId }, data: { status: 'ATIVO', renewalAlertSentAt: new Date(), renewalAlertForEndDate: new Date('2026-11-01') } });

    const res = await app.inject({ method: 'POST', url: `/contracts/${contractId}/renew`, headers: auth(token), payload: { newEndDate: '2027-11-01', adjustmentPercent: 5 } });
    expect(res.statusCode).toBe(200);
    const row = await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { versions: true } });
    expect(Number(row.value)).toBe(1050);
    expect(row.endDate?.toISOString().slice(0, 10)).toBe('2027-11-01');
    expect(row.renewalAlertSentAt).toBeNull();
    expect(row.renewalAlertForEndDate).toBeNull();
    expect(row.versions).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { action: 'renovou o' } })).toBe(1);

    const earlier = await app.inject({ method: 'POST', url: `/contracts/${contractId}/renew`, headers: auth(token), payload: { newEndDate: '2027-01-01' } });
    expect(earlier.statusCode).toBe(400);

    const assistant = await createFixtureUser({ officeId: f.officeId, role: 'ASSISTANT' });
    const assistantToken = await login(app, assistant.email, assistant.password);
    const denied = await app.inject({ method: 'POST', url: `/contracts/${contractId}/renew`, headers: auth(assistantToken), payload: { newEndDate: '2028-11-01' } });
    expect(denied.statusCode).toBe(403);
  });

  // --- Aprovação interna ------------------------------------------------------
  it('aprovação interna: ASSISTANT redige e envia p/ revisão, não aprova nem envia; LAWYER aprova; outro escritório não acessa', async () => {
    const admin = await createFixtureUser();
    const lawyer = await createFixtureUser({ officeId: admin.officeId, role: 'LAWYER' });
    const assistant = await createFixtureUser({ officeId: admin.officeId, role: 'ASSISTANT' });
    const adminToken = await login(app, admin.email, admin.password);
    const lawyerToken = await login(app, lawyer.email, lawyer.password);
    const assistantToken = await login(app, assistant.email, assistant.password);

    // sem a flag: assistente continua sem poder criar contratos
    const { clientId, templateId } = await createFixtureClientAndTemplate(admin.officeId);
    const payload = { clientId, templateId, value: 100, object: 'Objeto', startDate: '2026-01-01' };
    expect((await app.inject({ method: 'POST', url: '/contracts', headers: auth(assistantToken), payload })).statusCode).toBe(403);

    const flag = await app.inject({ method: 'PATCH', url: '/offices/me', headers: auth(adminToken), payload: { requireInternalApproval: true } });
    expect(flag.statusCode).toBe(200);
    expect(flag.json().office.requireInternalApproval).toBe(true);

    const created = await app.inject({ method: 'POST', url: '/contracts', headers: auth(assistantToken), payload });
    expect(created.statusCode).toBe(201);
    const contractId = created.json().contract.id as string;

    // não envia direto nem por status
    expect((await app.inject({ method: 'PATCH', url: `/contracts/${contractId}/status`, headers: auth(assistantToken), payload: { status: 'enviado' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/contracts/${contractId}/status`, headers: auth(lawyerToken), payload: { status: 'enviado' } })).statusCode).toBe(409);

    const submitted = await app.inject({ method: 'POST', url: `/contracts/${contractId}/submit-review`, headers: auth(assistantToken) });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().contract.status).toBe('pronto_envio');
    expect(await prisma.notification.count({ where: { userId: lawyer.userId } })).toBe(1);

    expect((await app.inject({ method: 'POST', url: `/contracts/${contractId}/approve`, headers: auth(assistantToken) })).statusCode).toBe(403);

    const intruder = await createFixtureUser();
    const intruderToken = await login(app, intruder.email, intruder.password);
    expect((await app.inject({ method: 'POST', url: `/contracts/${contractId}/approve`, headers: auth(intruderToken) })).statusCode).toBe(404);

    const rejected = await app.inject({ method: 'POST', url: `/contracts/${contractId}/reject`, headers: auth(lawyerToken), payload: { reason: 'Ajustar a cláusula 3' } });
    expect(rejected.json().contract.status).toBe('rascunho');
    expect(rejected.json().contract.internalReview.rejectionReason).toBe('Ajustar a cláusula 3');
    expect(await prisma.notification.count({ where: { userId: assistant.userId } })).toBe(1);

    await app.inject({ method: 'POST', url: `/contracts/${contractId}/submit-review`, headers: auth(assistantToken) });
    const approved = await app.inject({ method: 'POST', url: `/contracts/${contractId}/approve`, headers: auth(lawyerToken) });
    expect(approved.json().contract.status).toBe('aprovado');
    const sent = await app.inject({ method: 'PATCH', url: `/contracts/${contractId}/status`, headers: auth(lawyerToken), payload: { status: 'enviado' } });
    expect(sent.statusCode).toBe(200);
  });

  // --- 2FA --------------------------------------------------------------------
  it('2FA: setup só ativa com código válido; login em 2 etapas; challenge não autentica API; código de recuperação é de uso único', async () => {
    const f = await createFixtureUser({ role: 'LAWYER' });
    const token = await login(app, f.email, f.password);

    const setup = await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: auth(token) });
    expect(setup.statusCode).toBe(200);
    const { secret } = setup.json() as { secret: string };
    expect((await app.inject({ method: 'GET', url: '/auth/2fa/status', headers: auth(token) })).json().enabled).toBe(false);

    const wrong = await app.inject({ method: 'POST', url: '/auth/2fa/verify-setup', headers: auth(token), payload: { code: '000000' } });
    expect(wrong.statusCode).toBe(400);

    const confirm = await app.inject({ method: 'POST', url: '/auth/2fa/verify-setup', headers: auth(token), payload: { code: totpAt(secret, totpStep(new Date())) } });
    expect(confirm.statusCode).toBe(200);
    const backupCodes = confirm.json().backupCodes as string[];
    expect(backupCodes).toHaveLength(10);

    // o segredo nunca é devolvido depois do setup e não está em texto puro no banco
    const status = await app.inject({ method: 'GET', url: '/auth/2fa/status', headers: auth(token) });
    expect(JSON.stringify(status.json())).not.toContain(secret);
    const stored = await prisma.userTwoFactor.findUniqueOrThrow({ where: { userId: f.userId } });
    expect(stored.secretEncrypted).not.toContain(secret);
    expect(await prisma.userBackupCode.count({ where: { userId: f.userId } })).toBe(10);

    // login agora exige a 2ª etapa e NÃO devolve accessToken
    const step1 = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: f.email, password: f.password } });
    expect(step1.statusCode).toBe(200);
    expect(step1.json().requiresTwoFactor).toBe(true);
    expect(step1.json().accessToken).toBeUndefined();
    const challengeToken = step1.json().challengeToken as string;

    // o challenge não autentica nenhuma rota protegida
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: auth(challengeToken) })).statusCode).toBe(401);

    expect((await app.inject({ method: 'POST', url: '/auth/2fa/verify-login', payload: { challengeToken, code: '000000' } })).statusCode).toBe(401);

    // TOTP do PRÓXIMO passo (aceito pela janela ±1 e ainda não usado)
    const ok = await app.inject({ method: 'POST', url: '/auth/2fa/verify-login', payload: { challengeToken, code: totpAt(secret, totpStep(new Date()) + 1) } });
    expect(ok.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: auth(ok.json().accessToken) })).statusCode).toBe(200);

    // código de recuperação: funciona uma vez; reutilizar falha
    const code = backupCodes[0] as string;
    const used = await app.inject({ method: 'POST', url: '/auth/2fa/verify-login', payload: { challengeToken, code } });
    expect(used.statusCode).toBe(200);
    const reuse = await app.inject({ method: 'POST', url: '/auth/2fa/verify-login', payload: { challengeToken, code } });
    expect(reuse.statusCode).toBe(401);
  });

  it('2FA: ASSISTANT não configura; usuário sem 2FA continua entrando normalmente; desativar exige senha + código', async () => {
    const assistant = await createFixtureUser({ role: 'ASSISTANT' });
    const assistantToken = await login(app, assistant.email, assistant.password);
    expect((await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: auth(assistantToken) })).statusCode).toBe(403);

    const admin = await createFixtureUser();
    const plain = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: admin.email, password: admin.password } });
    expect(plain.json().accessToken).toBeTruthy();
    expect(plain.json().requiresTwoFactor).toBeUndefined();

    const token = plain.json().accessToken as string;
    const { secret } = (await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: auth(token) })).json();
    await app.inject({ method: 'POST', url: '/auth/2fa/verify-setup', headers: auth(token), payload: { code: totpAt(secret, totpStep(new Date())) } });
    const nextCode = totpAt(secret, totpStep(new Date()) + 1);
    const badPassword = await app.inject({ method: 'POST', url: '/auth/2fa/disable', headers: auth(token), payload: { password: 'errada', code: nextCode } });
    expect(badPassword.statusCode).toBe(400);
    const off = await app.inject({ method: 'POST', url: '/auth/2fa/disable', headers: auth(token), payload: { password: admin.password, code: nextCode } });
    expect(off.statusCode).toBe(204);
    expect(await prisma.userTwoFactor.count({ where: { userId: admin.userId } })).toBe(0);
  });

  // --- Dashboard / CSV --------------------------------------------------------
  it('dashboard financeiro e CSV: só dados do próprio escritório', async () => {
    const a = await createFixtureUser();
    const b = await createFixtureUser();
    const tokenA = await login(app, a.email, a.password);
    const tokenB = await login(app, b.email, b.password);
    const contractA = await createContract(app, tokenA, a.officeId);
    const contractB = await createContract(app, tokenB, b.officeId);
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    for (const [token, contractId, value] of [[tokenA, contractA, 150.5], [tokenB, contractB, 999]] as const) {
      await app.inject({ method: 'POST', url: '/payments', headers: auth(token), payload: { contractId, installmentNumber: 1, installmentTotal: 1, value, dueDate: past } });
    }

    const report = await app.inject({ method: 'GET', url: '/dashboard/receivables', headers: auth(tokenA), query: { period: 'last_3_months' } });
    expect(report.statusCode).toBe(200);
    expect(report.json().delinquency).toMatchObject({ overdueCount: 1, overdueTotal: 150.5, contractsWithOverdue: 1 });
    expect(report.json().delinquency.maxDaysOverdue).toBeGreaterThanOrEqual(10);
    expect(report.json().delinquencyTable.data).toHaveLength(1);

    const csv = await app.inject({ method: 'GET', url: '/dashboard/receivables/export', headers: auth(tokenA), query: { period: 'last_3_months' } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.startsWith('\uFEFFCliente;Contrato')).toBe(true);
    expect(csv.body).toContain('150,50');
    expect(csv.body).not.toContain('999,00');

    expect((await app.inject({ method: 'GET', url: '/dashboard/receivables', query: { period: 'custom' }, headers: auth(tokenA) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/dashboard/receivables/export' })).statusCode).toBe(401);
  });
});
