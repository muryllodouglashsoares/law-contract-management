import { useState } from 'react';
import { AlertCircle, Check, Copy, FileCheck2, Link2, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage, useApiQuery } from '../hooks/useApiQuery';
import { buildSignatureWhatsAppMessage, buildWhatsAppUrl } from '../lib/whatsapp';
import { contractsService } from '../services/contracts';
import type { ContractStatusApi, SignatureEmailStatus, SignatureLink, SignatureLinkState } from '../types/api';

const SIGNABLE: ContractStatusApi[] = ['enviado', 'em_revisao'];

const STATE_LABELS: Record<SignatureLinkState, { label: string; style: { backgroundColor: string; color: string } }> = {
  active: { label: 'Link ativo', style: { backgroundColor: '#ECFDF5', color: '#047857' } },
  used: { label: 'Assinado', style: { backgroundColor: '#EFF6FF', color: '#1D4ED8' } },
  expired: { label: 'Expirado', style: { backgroundColor: '#FFFBEB', color: '#B45309' } },
  revoked: { label: 'Substituído', style: { backgroundColor: '#F1F5F9', color: '#475569' } },
};

const EMAIL_MESSAGES: Record<SignatureEmailStatus, { text: string; ok: boolean }> = {
  sent: { text: 'Link enviado por e-mail ao cliente.', ok: true },
  failed: { text: 'Não foi possível enviar o e-mail. O link foi criado: copie ou envie pelo WhatsApp.', ok: false },
  unavailable: { text: 'O envio automático por e-mail não está configurado neste sistema. Copie o link ou use o WhatsApp.', ok: false },
  disabled_by_preference: { text: 'O envio por e-mail está desativado nas suas preferências (Configurações → Preferências).', ok: false },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

interface Props {
  contractId: string;
  contractNumber: number;
  contractStatus: ContractStatusApi;
  /** Telefone do cliente (cadastro). Usado só para abrir o WhatsApp com a mensagem pronta. */
  clientPhone: string | null;
}

/**
 * Aceite eletrônico por link público de uso único (assinatura eletrônica SIMPLES —
 * não é assinatura digital ICP-Brasil). Visível só para ADMIN/LAWYER, como conveniência
 * de UX: a autorização real é do backend (403 para os demais papéis).
 */
export default function ContractSignaturePanel({ contractId, contractNumber, contractStatus, clientPhone }: Props) {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LAWYER';

  const { data, refetch } = useApiQuery(
    () => (canManage ? contractsService.listSignatures(contractId) : Promise.resolve({ data: [] })),
    [contractId, contractStatus, canManage],
  );

  const [link, setLink] = useState<SignatureLink | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailStatus, setEmailStatus] = useState<SignatureEmailStatus | null>(null);
  const [downloadingSigned, setDownloadingSigned] = useState(false);

  if (!canManage) return null;

  const signable = SIGNABLE.includes(contractStatus);
  const records = data?.data ?? [];

  async function downloadSigned() {
    setDownloadingSigned(true);
    setError(null);
    try {
      await contractsService.downloadSignedPdf(contractId, `Contrato_${contractNumber}_assinado.pdf`);
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível baixar o PDF assinado.'));
    } finally {
      setDownloadingSigned(false);
    }
  }

  async function generate(sendEmail = false) {
    setError(null);
    setGenerating(true);
    setCopied(false);
    setEmailStatus(null);
    try {
      const created = await contractsService.createSignatureLink(contractId, { sendEmail });
      setLink(created);
      setEmailStatus(created.email ?? null);
      refetch();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível gerar o link de aceite.'));
    } finally {
      setGenerating(false);
    }
  }

  // Só abre o WhatsApp (wa.me) com a mensagem preenchida: nada é enviado pelo sistema, não há
  // requisição ao backend e o link/estado da assinatura não mudam. O usuário confirma o envio no app.
  const whatsappUrl = link
    ? buildWhatsAppUrl(clientPhone, buildSignatureWhatsAppMessage({ contractNumber, url: link.url }))
    : null;

  function sendByWhatsApp() {
    if (!whatsappUrl) return;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
    }
  }

  return (
    <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck size={13} /> Aceite eletrônico
          </h4>
          <p className="text-xs mt-1 max-w-xl" style={{ color: 'var(--color-muted-foreground)' }}>
            Assinatura eletrônica simples por link público de uso único. Não equivale a assinatura digital com certificado ICP-Brasil.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => generate(false)}
            disabled={!signable || generating}
            title={signable ? undefined : 'Disponível para contratos enviados ou em revisão'}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Link2 size={14} /> {generating ? 'Gerando...' : 'Gerar link de aceite'}
          </button>
          <button
            onClick={() => generate(true)}
            disabled={!signable || generating}
            title={signable ? 'Gera um novo link e envia por e-mail ao cliente (o link anterior deixa de valer)' : 'Disponível para contratos enviados ou em revisão'}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border rounded-lg bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <Mail size={14} /> Gerar e enviar por e-mail
          </button>
        </div>
      </div>

      {!signable && records.length === 0 && (
        <p className="text-xs text-slate-400">
          O link pode ser gerado quando o contrato estiver como "Enviado" ou "Em revisão".
        </p>
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {emailStatus && (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg"
          style={EMAIL_MESSAGES[emailStatus].ok ? { backgroundColor: '#ECFDF5', color: '#047857' } : { backgroundColor: '#FFFBEB', color: '#92400E' }}
        >
          <Mail size={15} className="flex-shrink-0" /> {EMAIL_MESSAGES[emailStatus].text}
        </div>
      )}

      {link && (
        <div className="mb-4 p-3 rounded-lg border bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Link de aceite eletrônico"
              className="flex-1 min-w-0 px-3 py-2 text-xs border rounded-lg bg-white"
              style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-mono)' }}
            />
            <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg bg-white hover:bg-slate-50 text-slate-700" style={{ borderColor: 'var(--color-border)' }}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={sendByWhatsApp}
              disabled={!whatsappUrl}
              title={whatsappUrl ? undefined : 'O cliente não possui um telefone válido cadastrado'}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <MessageCircle size={13} /> Enviar por WhatsApp
            </button>
            {!whatsappUrl && (
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                O cliente não possui telefone válido cadastrado. Atualize o cadastro ou copie o link.
              </span>
            )}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)' }}>
            Versão {link.versionNumber} · uso único · expira em {formatDateTime(link.expiresAt)}. Este link só é exibido agora;
            se precisar de outro, gere um novo (o anterior deixa de valer).
          </p>
        </div>
      )}

      {records.length > 0 && (
        <ul className="space-y-2">
          {records.map((record) => {
            const state = STATE_LABELS[record.state];
            return (
              <li key={record.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-0">
                  <div className="text-slate-800 font-medium">
                    Versão {record.versionNumber}
                    {record.signerName ? ` · ${record.signerName}` : ''}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                    {record.signedAt
                      ? `Assinado em ${formatDateTime(record.signedAt)}${record.signerIp ? ` · IP ${record.signerIp}` : ''}`
                      : `Gerado em ${formatDateTime(record.createdAt)} · expira em ${formatDateTime(record.expiresAt)}`}
                  </div>
                  {record.state === 'active' && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                      {record.openCount > 0
                        ? `Aberto ${record.openCount}x · primeira abertura em ${formatDateTime(record.firstOpenedAt ?? record.createdAt)}`
                        : 'Cliente ainda não abriu o link'}
                    </div>
                  )}
                  {record.state === 'used' && (
                    <button
                      onClick={downloadSigned}
                      disabled={downloadingSigned}
                      className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                      style={{ borderColor: 'var(--color-border)', color: '#1D4ED8' }}
                    >
                      <FileCheck2 size={13} /> {downloadingSigned ? 'Baixando...' : 'PDF assinado (com comprovante)'}
                    </button>
                  )}
                  {record.signatureHash && (
                    <div className="text-xs mt-0.5 break-all text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
                      SHA-256 {record.signatureHash}
                    </div>
                  )}
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap" style={state.style}>{state.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
