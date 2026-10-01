import { useState } from 'react';
import { AlertCircle, Check, Copy, Link2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage, useApiQuery } from '../hooks/useApiQuery';
import { contractsService } from '../services/contracts';
import type { ContractStatusApi, SignatureLink, SignatureLinkState } from '../types/api';

const SIGNABLE: ContractStatusApi[] = ['enviado', 'em_revisao'];

const STATE_LABELS: Record<SignatureLinkState, { label: string; style: { backgroundColor: string; color: string } }> = {
  active: { label: 'Link ativo', style: { backgroundColor: '#ECFDF5', color: '#047857' } },
  used: { label: 'Assinado', style: { backgroundColor: '#EFF6FF', color: '#1D4ED8' } },
  expired: { label: 'Expirado', style: { backgroundColor: '#FFFBEB', color: '#B45309' } },
  revoked: { label: 'Substituído', style: { backgroundColor: '#F1F5F9', color: '#475569' } },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

interface Props {
  contractId: string;
  contractStatus: ContractStatusApi;
}

/**
 * Aceite eletrônico por link público de uso único (assinatura eletrônica SIMPLES —
 * não é assinatura digital ICP-Brasil). Visível só para ADMIN/LAWYER, como conveniência
 * de UX: a autorização real é do backend (403 para os demais papéis).
 */
export default function ContractSignaturePanel({ contractId, contractStatus }: Props) {
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

  if (!canManage) return null;

  const signable = SIGNABLE.includes(contractStatus);
  const records = data?.data ?? [];

  async function generate() {
    setError(null);
    setGenerating(true);
    setCopied(false);
    try {
      const created = await contractsService.createSignatureLink(contractId);
      setLink(created);
      refetch();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível gerar o link de aceite.'));
    } finally {
      setGenerating(false);
    }
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
        <button
          onClick={generate}
          disabled={!signable || generating}
          title={signable ? undefined : 'Disponível para contratos enviados ou em revisão'}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Link2 size={14} /> {generating ? 'Gerando...' : 'Gerar link de aceite'}
        </button>
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
