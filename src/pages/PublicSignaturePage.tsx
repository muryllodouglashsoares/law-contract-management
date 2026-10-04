import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Scale, ShieldCheck, XCircle } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { formatCpfOrCnpj } from '../lib/br-document';
import { formatDateOnly } from '../lib/contract-dates';
import { buildSignPayload, evaluateSignatureForm } from '../lib/signature-form';
import { publicSignaturesService } from '../services/publicSignatures';
import type { PublicSignatureResult, PublicSignatureView } from '../types/api';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'valid'; data: PublicSignatureView }
  | { kind: 'expired' }
  | { kind: 'used' }
  | { kind: 'invalid' }
  | { kind: 'signed'; result: PublicSignatureResult }
  | { kind: 'error'; message: string };

/** Traduz a resposta do backend (a única fonte de verdade sobre o token) em um estado de tela. */
function stateFromError(error: unknown): ViewState {
  if (error instanceof ApiError) {
    if (error.status === 404) return { kind: 'invalid' };
    if (error.status === 410) {
      if (error.code === 'SIGNATURE_LINK_EXPIRED') return { kind: 'expired' };
      if (error.code === 'SIGNATURE_LINK_USED') return { kind: 'used' };
      return { kind: 'invalid' };
    }
    return { kind: 'error', message: error.message };
  }
  return { kind: 'error', message: 'Não foi possível concluir a operação. Tente novamente.' };
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <header className="bg-white border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }}>
            <Scale size={16} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-foreground)' }}>
            LexContract
          </span>
          <span className="ml-auto text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Aceite eletrônico</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">{children}</main>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex justify-center mb-3">{icon}</div>
      <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
      <p className="text-sm mt-2" style={{ color: 'var(--color-muted-foreground)' }}>{children}</p>
    </div>
  );
}

export default function PublicSignaturePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  const [signerName, setSignerName] = useState('');
  const [signerDocument, setSignerDocument] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = evaluateSignatureForm({ signerName, signerDocument, consent });
  const documentTouched = form.document.status !== 'empty';
  const documentInvalid = form.document.status === 'invalid-cpf' || form.document.status === 'invalid-cnpj';

  // A página contém um token na URL: sem indexação e sem enviar Referer a terceiros.
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    document.head.append(robots, referrer);
    const previousTitle = document.title;
    document.title = 'Aceite eletrônico · LexContract';
    return () => {
      robots.remove();
      referrer.remove();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    publicSignaturesService
      .get(token)
      .then((data) => {
        if (!cancelled) setState({ kind: 'valid', data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(stateFromError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state.kind !== 'valid' || submitting) return;
    setFormError(null);

    if (!consent) {
      setFormError('Confirme o consentimento para assinar.');
      return;
    }

    // Só dígitos vão para o backend (sem máscara/pontuação). O backend revalida tudo: esta
    // checagem existe apenas para melhorar a experiência.
    const payload = buildSignPayload({ signerName, signerDocument, consent });
    if (!payload) {
      setFormError(form.document.message ?? 'Confira o nome e o CPF/CNPJ informados.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await publicSignaturesService.sign(token, payload);
      setState({ kind: 'signed', result });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        // Erros de validação (nome/CPF-CNPJ): o usuário corrige e reenvia.
        setFormError(error.details?.[0]?.message ?? error.message);
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(error.message);
      } else {
        setState(stateFromError(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <Shell>
        <div className="py-20 flex justify-center" role="status" aria-label="Carregando">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      </Shell>
    );
  }

  if (state.kind === 'expired') {
    return (
      <Shell>
        <Notice icon={<Clock size={36} style={{ color: '#B45309' }} />} title="Link expirado">
          Este link de assinatura expirou. Solicite um novo link ao escritório responsável pelo contrato.
        </Notice>
      </Shell>
    );
  }

  if (state.kind === 'used') {
    return (
      <Shell>
        <Notice icon={<CheckCircle2 size={36} style={{ color: '#475569' }} />} title="Link já utilizado">
          Este link de uso único já foi utilizado e não pode ser aberto novamente. Se precisar de uma nova via, fale com o escritório.
        </Notice>
      </Shell>
    );
  }

  if (state.kind === 'invalid') {
    return (
      <Shell>
        <Notice icon={<XCircle size={36} style={{ color: '#DC2626' }} />} title="Link inválido">
          Este link não existe ou não está mais disponível. Confira o endereço recebido ou solicite um novo link ao escritório.
        </Notice>
      </Shell>
    );
  }

  if (state.kind === 'error') {
    return (
      <Shell>
        <Notice icon={<AlertCircle size={36} style={{ color: '#DC2626' }} />} title="Não foi possível continuar">
          {state.message}
        </Notice>
      </Shell>
    );
  }

  if (state.kind === 'signed') {
    const { result } = state;
    return (
      <Shell>
        <div className="bg-white rounded-xl border p-8" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-center">
            <CheckCircle2 size={44} className="mx-auto mb-3" style={{ color: '#059669' }} />
            <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
              Contrato assinado com sucesso
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
              Seu aceite eletrônico foi registrado. Guarde o código abaixo como comprovante.
            </p>
          </div>
          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-slate-400">Contrato</dt><dd className="font-semibold text-slate-800">#{result.contractNumber}</dd></div>
            <div><dt className="text-xs text-slate-400">Signatário</dt><dd className="font-semibold text-slate-800">{result.signerName}</dd></div>
            <div><dt className="text-xs text-slate-400">Data e hora</dt><dd className="font-semibold text-slate-800">{new Date(result.signedAt).toLocaleString('pt-BR')}</dd></div>
            <div>
              <dt className="text-xs text-slate-400">Código do evento</dt>
              <dd className="font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                {result.signatureHash.slice(0, 12).toUpperCase()}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-xs break-all text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
            SHA-256: {result.signatureHash}
          </p>
        </div>
      </Shell>
    );
  }

  const { data } = state;
  return (
    <Shell>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{data.officeName}</p>
          <h1 className="text-lg font-bold text-slate-900 mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>
            Contrato #{data.contract.number}
          </h1>
          <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="col-span-2"><dt className="text-xs text-slate-400">Cliente</dt><dd className="font-semibold text-slate-800">{data.contract.clientName}</dd></div>
            <div><dt className="text-xs text-slate-400">Valor</dt><dd className="font-semibold text-slate-800 tabular-nums">{brl(data.contract.value)}</dd></div>
            <div><dt className="text-xs text-slate-400">Versão</dt><dd className="font-semibold text-slate-800">{data.version.versionNumber}</dd></div>
            <div><dt className="text-xs text-slate-400">Início</dt><dd className="font-semibold text-slate-800">{formatDateOnly(data.contract.startDate)}</dd></div>
            <div><dt className="text-xs text-slate-400">Término</dt><dd className="font-semibold text-slate-800">{data.contract.endDate ? formatDateOnly(data.contract.endDate) : '—'}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-400">Objeto</dt><dd className="text-slate-800">{data.contract.object}</dd></div>
          </dl>
        </div>

        <div className="px-6 py-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Conteúdo que será aceito (versão {data.version.versionNumber})</h2>
          <div
            className="rounded-lg border p-4 max-h-96 overflow-y-auto text-sm whitespace-pre-wrap text-slate-700"
            style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA', lineHeight: 1.7 }}
            tabIndex={0}
            aria-label="Texto do contrato"
          >
            {data.version.content}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 border-t space-y-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
            <Clock size={14} className="mt-0.5 flex-shrink-0" />
            <span>Este link é de uso único e vale até {new Date(data.expiresAt).toLocaleString('pt-BR')}.</span>
          </div>

          {formError && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }} role="alert">
              <AlertCircle size={15} className="flex-shrink-0" /> {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="signer-name" className="block text-xs font-medium text-slate-700 mb-1.5">Nome completo *</label>
              <input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                required
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
            <div>
              <label htmlFor="signer-document" className="block text-xs font-medium text-slate-700 mb-1.5">CPF ou CNPJ *</label>
              <input
                id="signer-document"
                value={signerDocument}
                onChange={(e) => setSignerDocument(formatCpfOrCnpj(e.target.value))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                maxLength={18}
                required
                aria-invalid={documentInvalid}
                aria-describedby="signer-document-feedback"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
                style={{
                  borderColor: documentInvalid ? '#DC2626' : form.document.valid ? '#059669' : 'var(--color-border)',
                }}
              />
              <p
                id="signer-document-feedback"
                role={documentInvalid ? 'alert' : undefined}
                className="mt-1.5 text-xs flex items-center gap-1"
                style={{ color: form.document.valid ? '#059669' : documentInvalid ? '#DC2626' : 'var(--color-muted-foreground)' }}
              >
                {form.document.valid && (<><CheckCircle2 size={12} /> {form.document.digits.length === 11 ? 'CPF válido' : 'CNPJ válido'}</>)}
                {documentInvalid && (<><XCircle size={12} /> {form.document.message}</>)}
                {form.document.status === 'incomplete' && (<>Documento incompleto — {form.document.message}.</>)}
                {!documentTouched && <>Digite apenas números; a formatação é automática.</>}
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>{data.consent.text}</span>
          </label>

          <button
            type="submit"
            disabled={submitting || !form.canSubmit}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <ShieldCheck size={15} /> {submitting ? 'Assinando...' : 'Assinar contrato'}
          </button>

          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Aceite eletrônico simples: registramos seu nome, documento, data/hora e endereço IP. Não se trata de assinatura digital com certificado ICP-Brasil.
          </p>
        </form>
      </div>
    </Shell>
  );
}
