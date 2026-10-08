import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app';
import { ContractReviewService } from '../../src/modules/contracts/contract-review.service';
import { ContractService } from '../../src/modules/contracts/contract.service';
import { receivablesQuerySchema } from '../../src/modules/dashboard/dashboard.schemas';
import { ReceivablesService, csvCell, formatMoneyPtBr, resolvePeriod } from '../../src/modules/dashboard/receivables.service';
import { sanitizeEmailError, EmailService } from '../../src/modules/notifications/email.service';
import { EmailJsProvider, NoopEmailProvider, createEmailProvider } from '../../src/modules/notifications/channels/email-provider';
import { NotificationDispatcher } from '../../src/modules/notifications/notification-dispatcher';
import { NotificationPreferenceService } from '../../src/modules/notifications/notification-preferences.service';
import { resolvePushRecipients } from '../../src/modules/notifications/push-recipients';
import { buildSignatureEmail, createSignatureLinkMailer } from '../../src/modules/contract-signatures/signature-link-mailer';
import { createRequireContractAuthor } from '../../src/shared/auth/require-contract-author';
import { isTransitionBlockedForGenericStatusUpdate, contractStatusTransitionsFrom, derivePaymentDisplayStatus } from '../../src/shared/domain/status-map';
import { crc16Ccitt, isValidPixPayload } from '../../src/shared/utils/pix';
import { generateInstallmentsBodySchema } from '../../src/modules/payments/payment.schemas';

vi.mock('../../src/shared/database/prisma', () => ({ prisma: {} }));

// ---------------------------------------------------------------------------
// Aprovação interna
// ---------------------------------------------------------------------------
function makeReview(opts: { approval?: boolean; status?: string; responsibleId?: string; submittedById?: string | null; officeId?: string } = {}) {
  const contract: any = {
    id: 'c1', number: 123, status: opts.status ?? 'RASCUNHO', responsibleId: opts.responsibleId ?? 'assistant-1',
    reviewSubmittedById: opts.submittedById ?? null,
  };
  const notifications: any[] = [];
  const audits: any[] = [];
  const updates: any[] = [];
  const prisma: any = {
    office: { findUnique: vi.fn(async () => ({ requireInternalApproval: opts.approval ?? true })) },
    contract: {
      findFirst: vi.fn(async ({ where }: any) => (where.officeId === (opts.officeId ?? 'office1') && where.id === contract.id ? { ...contract } : null)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const allowed = typeof where.status === 'string' ? [where.status] : where.status.in;
        if (!allowed.includes(contract.status)) return { count: 0 };
        Object.assign(contract, data);
        updates.push(data);
        return { count: 1 };
      }),
    },
    user: { findMany: vi.fn(async () => [{ id: 'lawyer-1' }, { id: 'admin-1' }]) },
    notification: { create: vi.fn(async ({ data }: any) => void notifications.push(data)) },
    auditLog: { create: vi.fn(async ({ data }: any) => void audits.push(data)) },
  };
  prisma.$transaction = vi.fn(async (cb: any) => cb(prisma));
  const dispatch = vi.fn().mockResolvedValue(undefined);
  return { service: new ContractReviewService(prisma, { dispatch } as any), contract, notifications, audits, dispatch, updates };
}
const assistant = { userId: 'assistant-1', officeId: 'office1', role: 'ASSISTANT' as const };
const lawyer = { userId: 'lawyer-1', officeId: 'office1', role: 'LAWYER' as const };
const admin = { userId: 'admin-1', officeId: 'office1', role: 'ADMIN' as const };

describe('ContractReviewService — fluxo de aprovação interna', () => {
  it('ASSISTANT envia para revisão: PRONTO_ENVIO, notifica advogados/admins (não o próprio), auditoria e push', async () => {
    const { service, contract, notifications, audits, dispatch } = makeReview();
    await service.submit(assistant, 'c1');
    expect(contract).toMatchObject({ status: 'PRONTO_ENVIO', reviewSubmittedById: 'assistant-1', reviewDecision: null });
    expect(notifications.map((n) => n.userId).sort()).toEqual(['admin-1', 'lawyer-1']);
    expect(audits[0]).toMatchObject({ action: 'enviou para revisão interna o', entityLabel: 'Contrato #123' });
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ pushEvent: 'CONTRACT_REVIEW_SUBMITTED' });
  });

  it('não envia para revisão se a aprovação interna está desabilitada', async () => {
    const { service } = makeReview({ approval: false });
    await expect(service.submit(assistant, 'c1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('ASSISTANT não envia contrato de outro responsável', async () => {
    const { service } = makeReview({ responsibleId: 'other-assistant' });
    await expect(service.submit(assistant, 'c1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('ASSISTANT NÃO aprova nem rejeita', async () => {
    const { service, contract } = makeReview({ status: 'PRONTO_ENVIO', submittedById: 'assistant-1' });
    await expect(service.approve(assistant, 'c1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.reject(assistant, 'c1', 'motivo qualquer')).rejects.toMatchObject({ statusCode: 403 });
    expect(contract.status).toBe('PRONTO_ENVIO');
  });

  it.each([['LAWYER', lawyer], ['ADMIN', admin]] as const)('%s aprova e o assistente é notificado', async (_n, actor) => {
    const { service, contract, notifications, audits } = makeReview({ status: 'PRONTO_ENVIO', submittedById: 'assistant-1' });
    await service.approve(actor, 'c1');
    expect(contract).toMatchObject({ status: 'APROVADO', reviewDecision: 'APPROVED', reviewDecidedById: actor.userId });
    expect(notifications[0]).toMatchObject({ userId: 'assistant-1', title: 'Contrato aprovado' });
    expect(audits[0]).toMatchObject({ action: 'aprovou o' });
  });

  it('rejeição devolve ao RASCUNHO com motivo, notifica o assistente e o push não leva o motivo', async () => {
    const { service, contract, notifications, dispatch, audits } = makeReview({ status: 'PRONTO_ENVIO', submittedById: 'assistant-1' });
    await service.reject(lawyer, 'c1', 'Faltou a cláusula de multa');
    expect(contract).toMatchObject({ status: 'RASCUNHO', reviewDecision: 'REJECTED', reviewRejectionReason: 'Faltou a cláusula de multa' });
    expect(notifications[0]).toMatchObject({ userId: 'assistant-1', title: 'Contrato devolvido para ajustes' });
    expect(JSON.stringify(dispatch.mock.calls[0]?.[0].push)).not.toContain('multa');
    expect(JSON.stringify(audits)).not.toContain('multa');
  });

  it('usuário de outro escritório não acessa (404)', async () => {
    const { service } = makeReview({ status: 'PRONTO_ENVIO', officeId: 'office-A' });
    await expect(service.approve({ ...lawyer, officeId: 'office-B' }, 'c1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('só aprova o que está aguardando revisão; corrida entre revisores = só um vence', async () => {
    const draft = makeReview({ status: 'RASCUNHO' });
    await expect(draft.service.approve(lawyer, 'c1')).rejects.toMatchObject({ statusCode: 409 });
    const pending = makeReview({ status: 'PRONTO_ENVIO', submittedById: 'assistant-1' });
    const results = await Promise.allSettled([pending.service.approve(lawyer, 'c1'), pending.service.approve(admin, 'c1')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('máquina de estados com aprovação', () => {
  it('APROVADO existe e PRONTO_ENVIO → APROVADO → ENVIADO', () => {
    expect(contractStatusTransitionsFrom('PRONTO_ENVIO')).toContain('APROVADO');
    expect(contractStatusTransitionsFrom('APROVADO')).toContain('ENVIADO');
  });
  it('com aprovação ativa, ENVIADO só a partir de APROVADO', () => {
    expect(isTransitionBlockedForGenericStatusUpdate('RASCUNHO', 'ENVIADO', true).blocked).toBe(true);
    expect(isTransitionBlockedForGenericStatusUpdate('PRONTO_ENVIO', 'ENVIADO', true).blocked).toBe(true);
    expect(isTransitionBlockedForGenericStatusUpdate('APROVADO', 'ENVIADO', true).blocked).toBe(false);
    expect(isTransitionBlockedForGenericStatusUpdate('RASCUNHO', 'PRONTO_ENVIO', true).blocked).toBe(true);
  });
  it('com aprovação desligada o comportamento anterior é preservado', () => {
    expect(isTransitionBlockedForGenericStatusUpdate('RASCUNHO', 'ENVIADO', false).blocked).toBe(false);
    expect(isTransitionBlockedForGenericStatusUpdate('RASCUNHO', 'PRONTO_ENVIO', false).blocked).toBe(false);
  });
  it('APROVADO nunca por PATCH /status', () => {
    expect(isTransitionBlockedForGenericStatusUpdate('PRONTO_ENVIO', 'APROVADO', false).blocked).toBe(true);
    expect(isTransitionBlockedForGenericStatusUpdate('APROVADO', 'RASCUNHO', false).blocked).toBe(true);
  });
  it('parcela que vence hoje não é "atrasada"; ontem sim', () => {
    const now = new Date('2026-10-07T15:00:00Z');
    expect(derivePaymentDisplayStatus('PENDING', new Date('2026-10-07T00:00:00Z'), now)).toBe('pendente');
    expect(derivePaymentDisplayStatus('PENDING', new Date('2026-10-06T00:00:00Z'), now)).toBe('atrasado');
  });
});

describe('ASSISTANT enviando ao cliente (ContractService.updateStatus)', () => {
  it('com aprovação ativa, enviar sem aprovar é bloqueado pelo backend (409)', async () => {
    const existing = { id: 'c1', officeId: 'office1', status: 'RASCUNHO', responsible: { id: 'u' }, number: 1 };
    const prisma: any = { office: { findUnique: vi.fn(async () => ({ requireInternalApproval: true })) }, contract: { findFirst: vi.fn(async () => existing) } };
    const service = new ContractService(prisma);
    vi.spyOn(service, 'getById').mockResolvedValue(existing as any);
    await expect(service.updateStatus({ userId: 'u', officeId: 'office1' }, 'c1', 'enviado' as any)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('guard de criação/edição de contratos', () => {
  const guard = (role: string, requireInternalApproval: boolean) =>
    createRequireContractAuthor({ office: { findUnique: vi.fn(async () => ({ requireInternalApproval })) } as any })(
      { user: { role, officeId: 'o' } } as any,
      {} as any,
    );
  it('ADMIN/LAWYER sempre', async () => {
    await expect(guard('ADMIN', false)).resolves.toBeUndefined();
    await expect(guard('LAWYER', false)).resolves.toBeUndefined();
  });
  it('ASSISTANT só com aprovação interna habilitada', async () => {
    await expect(guard('ASSISTANT', false)).rejects.toMatchObject({ statusCode: 403 });
    await expect(guard('ASSISTANT', true)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Renovação
// ---------------------------------------------------------------------------
function makeRenew(overrides: any = {}) {
  const existing: any = {
    id: 'c1', officeId: 'office1', number: 123, status: 'ATIVO', value: new Prisma.Decimal('1000.00'),
    startDate: new Date('2025-11-01T00:00:00Z'), endDate: new Date('2026-11-01T00:00:00Z'), responsible: { id: 'u1', name: 'Ana' },
    ...overrides,
  };
  const updates: any[] = [];
  const versions: any[] = [];
  const audits: any[] = [];
  const tx: any = {
    contract: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!where.status.in.includes(existing.status)) return { count: 0 };
        updates.push(data);
        Object.assign(existing, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...existing, client: { name: 'Cli', document: '52998224725', type: 'PF', email: 'c@x.com', phone: null }, template: { content: 'Valor {{valor}}' } })),
    },
    user: { findUniqueOrThrow: vi.fn(async () => ({ name: 'Ana', oabNumber: null })) },
    office: { findUniqueOrThrow: vi.fn(async () => ({ name: 'Silva' })) },
    contractVersion: { findFirst: vi.fn(async () => ({ versionNumber: 2 })), create: vi.fn(async ({ data }: any) => void versions.push(data)) },
    auditLog: { create: vi.fn(async ({ data }: any) => void audits.push(data)) },
  };
  const prisma: any = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
  const service = new ContractService(prisma);
  vi.spyOn(service, 'getById').mockImplementation(async () => existing);
  (service as any).renderContractContent = vi.fn(() => 'conteúdo renderizado');
  return { service, existing, updates, versions, audits };
}
const renewActor = { userId: 'u1', officeId: 'office1' };

describe('ContractService.renew', () => {
  it('atualiza endDate, reinicia o ciclo de alertas e cria NOVA versão (nunca edita a assinada)', async () => {
    const { service, updates, versions, audits } = makeRenew();
    await service.renew(renewActor, 'c1', { newEndDate: new Date('2027-11-01T00:00:00Z') });
    expect(updates[0]).toMatchObject({ renewalAlertSentAt: null, renewalAlertForEndDate: null });
    expect(updates[0].endDate.toISOString()).toBe('2027-11-01T00:00:00.000Z');
    expect(updates[0].value.toFixed(2)).toBe('1000.00'); // sem reajuste, valor mantido
    expect(versions[0]).toMatchObject({ versionNumber: 3, changeNote: 'Renovação até 01/11/2027', authorId: 'u1' });
    expect(audits[0]).toMatchObject({ action: 'renovou o', entityLabel: 'Contrato #123 (até 01/11/2027)' });
  });

  it('aplica reajuste em Decimal e registra na versão', async () => {
    const { service, updates, versions } = makeRenew();
    await service.renew(renewActor, 'c1', { newEndDate: new Date('2027-11-01T00:00:00Z'), adjustmentPercent: 5.5 });
    expect(updates[0].value.toFixed(2)).toBe('1055.00');
    expect(versions[0].changeNote).toContain('reajuste de 5.5%');
  });

  it('exige newEndDate posterior ao término atual', async () => {
    const { service } = makeRenew();
    await expect(service.renew(renewActor, 'c1', { newEndDate: new Date('2026-11-01T00:00:00Z') })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.renew(renewActor, 'c1', { newEndDate: new Date('2026-01-01T00:00:00Z') })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('sem endDate, compara com a data de início', async () => {
    const { service } = makeRenew({ endDate: null });
    await expect(service.renew(renewActor, 'c1', { newEndDate: new Date('2025-10-01T00:00:00Z') })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.renew(renewActor, 'c1', { newEndDate: new Date('2026-12-01T00:00:00Z') })).resolves.toBeDefined();
  });

  it('só renova contratos ATIVO/ASSINADO', async () => {
    const { service } = makeRenew({ status: 'RASCUNHO' });
    await expect(service.renew(renewActor, 'c1', { newEndDate: new Date('2027-11-01T00:00:00Z') })).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
// Dashboard financeiro / CSV
// ---------------------------------------------------------------------------
describe('períodos do dashboard financeiro', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const iso = (r: { from: Date; to: Date }) => [r.from.toISOString().slice(0, 10), r.to.toISOString().slice(0, 10)];
  it('períodos fixos', () => {
    expect(iso(resolvePeriod('this_month', now))).toEqual(['2026-10-01', '2026-10-31']);
    expect(iso(resolvePeriod('last_month', now))).toEqual(['2026-09-01', '2026-09-30']);
    expect(iso(resolvePeriod('last_3_months', now))).toEqual(['2026-08-01', '2026-10-31']);
    expect(iso(resolvePeriod('last_6_months', now))).toEqual(['2026-05-01', '2026-10-31']);
    expect(iso(resolvePeriod('year', now))).toEqual(['2026-01-01', '2026-12-31']);
  });
  it('personalizado valida datas', () => {
    expect(iso(resolvePeriod('custom', now, { from: new Date('2026-02-01'), to: new Date('2026-02-28') }))).toEqual(['2026-02-01', '2026-02-28']);
    expect(() => resolvePeriod('custom', now)).toThrow();
    expect(() => resolvePeriod('custom', now, { from: new Date('2026-03-01'), to: new Date('2026-02-01') })).toThrow();
    expect(() => resolvePeriod('custom', now, { from: new Date('2015-01-01'), to: new Date('2026-02-01') })).toThrow();
  });
  it('query tem padrões e rejeita período desconhecido', () => {
    expect(receivablesQuerySchema.parse({}).period).toBe('this_month');
    expect(receivablesQuerySchema.safeParse({ period: 'forever' }).success).toBe(false);
  });
});

describe('exportação CSV', () => {
  it('neutraliza injeção de fórmula e escapa separadores/aspas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+55 11')).toBe("'+55 11");
    expect(csvCell('Silva; Souza')).toBe('"Silva; Souza"');
    expect(csvCell(12)).toBe('12');
  });
  it('formata dinheiro com vírgula e centavos exatos', () => {
    expect(formatMoneyPtBr(123456)).toBe('1234,56');
    expect(formatMoneyPtBr(5)).toBe('0,05');
  });

  it('gera CSV em UTF-8 com BOM, `;`, paginado por cursor e filtrado por officeId', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `p${i}`, installmentNumber: i + 1, installmentTotal: 3, value: new Prisma.Decimal(i === 0 ? '33.34' : '33.33'),
      dueDate: new Date(Date.UTC(2026, 8, 10 + i)), status: 'PENDING', paidAt: null, method: null,
      contract: { number: 7, client: { name: i === 0 ? 'Zé "da Silva"' : 'Ação & Cia' }, responsible: { name: 'Ana' } },
    }));
    const findMany = vi.fn(async () => rows);
    const service = new ReceivablesService({ payment: { findMany }, $queryRaw: vi.fn() } as any);
    let csv = '';
    for await (const chunk of service.exportCsv('office1', { range: { from: new Date('2026-09-01Z'), to: new Date('2026-09-30Z') }, scope: 'all' }, new Date('2026-10-07T12:00:00Z'))) csv += chunk;

    expect(csv.startsWith('\uFEFFCliente;Contrato;Parcela;Vencimento;Valor (R$);Status')).toBe(true);
    expect(csv).toContain('"Zé ""da Silva""";#7;1/3;10/09/2026;33,34;Atrasado;;;27;Ana');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(4);
    expect((findMany.mock.calls[0] as any)[0].where.officeId).toBe('office1');
  });
});

// ---------------------------------------------------------------------------
// Canais: e-mail, preferências, dispatcher, push, Pix
// ---------------------------------------------------------------------------
describe('provider de e-mail', () => {
  it('sem configuração → provider none: indisponível, não quebra', async () => {
    expect(createEmailProvider({ EMAIL_ENABLED: false, EMAIL_PROVIDER: 'emailjs' }).available).toBe(false);
    expect(createEmailProvider({ EMAIL_ENABLED: true, EMAIL_PROVIDER: 'none' }).available).toBe(false);
    expect(createEmailProvider({ EMAIL_ENABLED: true, EMAIL_PROVIDER: 'emailjs' }).available).toBe(false); // faltam credenciais
    const service = new EmailService({ emailDelivery: { create: vi.fn() } } as any, new NoopEmailProvider());
    await expect(service.send({ officeId: 'o', type: 'NOTIFICATION', message: { to: 'a@b.com', subject: 's', text: 't' } })).resolves.toEqual({ status: 'unavailable' });
  });

  it('EmailJS: payload com credenciais só no backend e mensagem de erro sem eco do provedor', async () => {
    const fetchImpl = vi.fn(async (_u: string, init: any) => ({ ok: init.body.includes('"fail"') ? false : true, status: 400, text: async () => 'segredo eco' }));
    const provider = new EmailJsProvider({ serviceId: 's', templateId: 't', publicKey: 'pub', privateKey: 'priv' }, fetchImpl as any);
    expect(await provider.send({ to: 'a@b.com', subject: 'x', text: 'y', action: { label: 'L', url: 'https://app/assinar/abc' } })).toEqual({ ok: true });
    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body).toMatchObject({ service_id: 's', template_id: 't', user_id: 'pub', accessToken: 'priv', template_params: { to_email: 'a@b.com', action_url: 'https://app/assinar/abc' } });
    const failed = await provider.send({ to: 'a@b.com', subject: 'fail', text: 'y' });
    expect(failed).toMatchObject({ ok: false, errorCode: 'EMAILJS_HTTP_400' });
    expect(JSON.stringify(failed)).not.toContain('segredo eco');
  });

  it('registra EmailDelivery sem corpo/link e sanitiza erros', async () => {
    const created: any[] = [];
    const prisma: any = { emailDelivery: { create: vi.fn(async ({ data }: any) => { created.push(data); return { id: 'd1' }; }) } };
    const provider: any = { name: 'emailjs', available: true, send: vi.fn(async () => ({ ok: false, errorCode: 'X', errorMessage: 'falhou https://app/assinar/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 token' })) };
    const outcome = await new EmailService(prisma, provider).send({ officeId: 'o1', type: 'SIGNATURE_LINK', contractId: 'c1', message: { to: 'cli@x.com', subject: 's', text: 't', action: { label: 'L', url: 'https://app/assinar/SEGREDO' } } });
    expect(outcome).toMatchObject({ status: 'failed' });
    expect(JSON.stringify(created[0])).not.toContain('SEGREDO');
    expect(created[0].errorMessage).not.toContain('AbCdEfGh');
    expect(created[0]).toMatchObject({ status: 'FAILED', recipient: 'cli@x.com', provider: 'emailjs' });
    expect(sanitizeEmailError('veja http://x.com/a')).toBe('veja [url]');
  });

  it('e-mail do link de assinatura: nome do cliente, contrato, validade e link; respeita emailEnabled', async () => {
    const mail = buildSignatureEmail({ officeId: 'o', senderUserId: 'u', contractId: 'c', contractNumber: 123, officeName: 'Silva', client: { name: 'Maria', email: 'm@x.com' }, url: 'https://app/assinar/T', expiresAt: new Date('2026-10-10T15:30:00Z') });
    expect(mail.text).toContain('Maria');
    expect(mail.text).toContain('#123');
    expect(mail.text).toContain('10/10/2026 às 12:30');
    expect(mail.action.url).toBe('https://app/assinar/T');

    const send = vi.fn(async () => ({ status: 'sent' as const, deliveryId: 'd' }));
    const email: any = { available: true, send };
    const input = { officeId: 'o', senderUserId: 'u', contractId: 'c', contractNumber: 1, officeName: 'S', client: { name: 'M', email: 'm@x.com' }, url: 'https://x', expiresAt: new Date() };
    const off = createSignatureLinkMailer(email, { get: async () => ({ emailEnabled: false, whatsappEnabled: false, pushEnabled: true }) } as any);
    expect(await off.send(input)).toBe('disabled_by_preference');
    expect(send).not.toHaveBeenCalled();
    const on = createSignatureLinkMailer(email, { get: async () => ({ emailEnabled: true, whatsappEnabled: false, pushEnabled: true }) } as any);
    expect(await on.send(input)).toBe('sent');
    expect(await createSignatureLinkMailer({ available: false } as any, {} as any).send(input)).toBe('unavailable');
  });
});

describe('preferências de notificação', () => {
  it('padrões sem linha; PATCH parcial por upsert; getMany preenche padrões', async () => {
    const rows = new Map<string, any>();
    const prisma: any = {
      userNotificationPreference: {
        findUnique: vi.fn(async ({ where }: any) => rows.get(where.userId) ?? null),
        findMany: vi.fn(async ({ where }: any) => where.userId.in.map((id: string) => rows.get(id)).filter(Boolean)),
        upsert: vi.fn(async ({ where, create, update }: any) => { const r = { ...(rows.get(where.userId) ?? create), ...update }; rows.set(where.userId, r); return r; }),
      },
    };
    const svc = new NotificationPreferenceService(prisma);
    expect(await svc.get('u1')).toEqual({ emailEnabled: true, whatsappEnabled: false, pushEnabled: true });
    expect(await svc.update('u1', { whatsappEnabled: true })).toEqual({ emailEnabled: true, whatsappEnabled: true, pushEnabled: true });
    expect(await svc.update('u1', { emailEnabled: false })).toEqual({ emailEnabled: false, whatsappEnabled: true, pushEnabled: true });
    const many = await svc.getMany(['u1', 'u2']);
    expect(many.get('u2')).toEqual({ emailEnabled: true, whatsappEnabled: false, pushEnabled: true });
    expect(many.get('u1')?.emailEnabled).toBe(false);
  });

  it('dispatcher só envia e-mail a quem tem emailEnabled e quando o provider está disponível', async () => {
    const send = vi.fn(async () => ({ status: 'sent' as const, deliveryId: 'd' }));
    const prisma: any = { user: { findMany: vi.fn(async () => [{ id: 'on', name: 'On', email: 'on@x.com' }, { id: 'off', name: 'Off', email: 'off@x.com' }]) } };
    const preferences: any = { getMany: async () => new Map([['on', { emailEnabled: true }], ['off', { emailEnabled: false }]]) };
    const push: any = { sendToUsers: vi.fn() };
    const dispatcher = new NotificationDispatcher({ prisma, push, email: { available: true, send } as any, preferences });
    await dispatcher.dispatch({ officeId: 'o1', pushEvent: 'PAYMENT_DUE_TODAY', responsibleId: 'on', push: { type: 'PAYMENT_DUE_TODAY', title: 't', body: 'b', url: '/x' }, email: { subject: 's', text: 't', userIds: ['on', 'off'] } });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as any)[0].message.to).toBe('on@x.com');

    send.mockClear();
    const unavailable = new NotificationDispatcher({ prisma, push, email: { available: false, send } as any, preferences });
    await unavailable.dispatch({ officeId: 'o1', pushEvent: 'PAYMENT_DUE_TODAY', responsibleId: 'on', push: { type: 'PAYMENT_DUE_TODAY', title: 't', body: 'b', url: '/x' }, email: { subject: 's', text: 't', userIds: ['on'] } });
    expect(send).not.toHaveBeenCalled();
  });

  it('push respeita pushEnabled = false e a política dos novos eventos', async () => {
    const prisma: any = {
      user: {
        findMany: vi.fn(async () => [
          { id: 'resp', officeId: 'o1', status: 'ACTIVE', role: 'LAWYER', notificationPreference: { pushEnabled: false } },
          { id: 'adm', officeId: 'o1', status: 'ACTIVE', role: 'ADMIN', notificationPreference: null },
        ]),
      },
    };
    const ctx = { officeId: 'o1', responsibleId: 'resp' };
    // PAYMENT_DUE_TODAY: só o responsável — que silenciou o push → ninguém
    expect(await resolvePushRecipients(prisma, 'PAYMENT_DUE_TODAY', ctx)).toEqual([]);
    // PAYMENT_OVERDUE: responsável + ADMINs → o admin recebe
    expect(await resolvePushRecipients(prisma, 'PAYMENT_OVERDUE', ctx)).toEqual([{ officeId: 'o1', userId: 'adm' }]);
  });
});

describe('Pix copia e cola', () => {
  const build = (body: string) => body + crc16Ccitt(body);
  const payload = build('00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913Escritorio X6009SAO PAULO62070503***6304');

  it('valida BR Code com CRC16 correto', () => {
    expect(isValidPixPayload(payload)).toBe(true);
    expect(crc16Ccitt('123456789')).toBe('29B1'); // vetor padrão CRC-16/CCITT-FALSE
  });
  it('rejeita CRC errado, texto qualquer e payload truncado', () => {
    expect(isValidPixPayload(payload.slice(0, -1) + (payload.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(isValidPixPayload('chave-pix@email.com')).toBe(false);
    expect(isValidPixPayload(payload.slice(0, 40))).toBe(false);
  });
});

describe('geração de parcelas — entrada', () => {
  const ok = { contractId: '8c0a8a7e-6a39-4a3b-9d8e-0f3f3a6f1b11', totalValue: 12000, installmentCount: 12, firstDueDate: '2026-11-10' };
  it('aceita entrada válida', () => expect(generateInstallmentsBodySchema.safeParse(ok).success).toBe(true));
  it.each([{ totalValue: 0 }, { totalValue: -1 }, { totalValue: 10.005 }, { installmentCount: 0 }, { installmentCount: 121 }, { installmentCount: 2.5 }, { contractId: 'x' }, { firstDueDate: 'ontem' }])('rejeita %o', (patch) => {
    expect(generateInstallmentsBodySchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rotas internas dos novos jobs
// ---------------------------------------------------------------------------
describe('rotas internas dos jobs de alerta', () => {
  let app: FastifyInstance;
  const SECRET = 'a'.repeat(40);
  afterEach(async () => app.close());

  it('exigem CRON_SECRET e devolvem apenas contagens', async () => {
    const paymentRun = vi.fn().mockResolvedValue({ processed: 5, notified: 2, skipped: 3, enabled: true });
    const signatureRun = vi.fn().mockResolvedValue({ processed: 1, notified: 1, skipped: 0, enabled: true });
    app = buildApp({ cronSecret: SECRET, renewalJob: { run: vi.fn() }, paymentAlertsJob: { run: paymentRun }, signatureAlertsJob: { run: signatureRun } });
    await app.ready();

    expect((await app.inject({ method: 'POST', url: '/internal/jobs/payment-due-alerts' })).statusCode).toBe(401);
    expect(paymentRun).not.toHaveBeenCalled();

    const payment = await app.inject({ method: 'POST', url: '/internal/jobs/payment-due-alerts', headers: { authorization: `Bearer ${SECRET}` } });
    expect(payment.statusCode).toBe(200);
    expect(payment.json()).toEqual({ status: 'ok', processed: 5, notified: 2, skipped: 3 });

    const signature = await app.inject({ method: 'POST', url: '/internal/jobs/signature-link-alerts', headers: { authorization: `Bearer ${SECRET}` } });
    expect(signature.json()).toEqual({ status: 'ok', processed: 1, notified: 1, skipped: 0 });
    expect((await app.inject({ method: 'GET', url: '/internal/jobs/payment-due-alerts', headers: { authorization: `Bearer ${SECRET}` } })).statusCode).toBe(404);
  });

  it('job desabilitado informa enabled:false', async () => {
    app = buildApp({ cronSecret: SECRET, renewalJob: { run: vi.fn() }, paymentAlertsJob: { run: vi.fn().mockResolvedValue({ processed: 0, notified: 0, skipped: 0, enabled: false }) } });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/internal/jobs/payment-due-alerts', headers: { authorization: `Bearer ${SECRET}` } });
    expect(res.json()).toMatchObject({ enabled: false });
  });
});
