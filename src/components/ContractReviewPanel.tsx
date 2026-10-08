import { useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, RotateCcw, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage } from '../hooks/useApiQuery';
import { contractsService } from '../services/contracts';
import type { Contract } from '../types/api';

interface Props {
  contract: Contract;
  onChanged: () => void | Promise<unknown>;
}

const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

/**
 * Seção "Revisão interna" (fluxo de aprovação). Só aparece quando o escritório exige aprovação ou o
 * contrato já passou por revisão. Os botões são conveniência de UX: o backend valida papel, status e escritório.
 */
export default function ContractReviewPanel({ contract, onChanged }: Props) {
  const { user, office } = useAuth();
  const [busy, setBusy] = useState<'submit' | 'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const review = contract.internalReview;
  const approvalRequired = office?.requireInternalApproval ?? false;
  const hasHistory = review.submittedAt !== null;
  if (!approvalRequired && !hasHistory && contract.status !== 'aprovado') return null;

  const isReviewer = user?.role === 'ADMIN' || user?.role === 'LAWYER';
  const canSubmit = approvalRequired && contract.status === 'rascunho' && (isReviewer || contract.responsible.id === user?.id);
  const canDecide = isReviewer && contract.status === 'pronto_envio';
  const canReturnApproved = isReviewer && contract.status === 'aprovado';

  async function run(kind: 'submit' | 'approve' | 'reject', action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      setRejecting(false);
      setReason('');
      await onChanged();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível concluir a ação.'));
    } finally {
      setBusy(null);
    }
  }

  const stateText =
    contract.status === 'pronto_envio'
      ? 'Aguardando revisão de um administrador ou advogado.'
      : contract.status === 'aprovado'
        ? 'Aprovado: já pode ser enviado ao cliente.'
        : review.decision === 'rejected'
          ? 'Devolvido para ajustes.'
          : contract.status === 'rascunho' && approvalRequired
            ? 'Em rascunho. Envie para revisão para liberar o envio ao cliente.'
            : '—';

  return (
    <section aria-labelledby="review-title" className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="review-title" className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ClipboardCheck size={15} /> Revisão interna
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>{stateText}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canSubmit && (
            <button disabled={busy !== null} onClick={() => run('submit', () => contractsService.submitReview(contract.id))} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              <Send size={14} /> {busy === 'submit' ? 'Enviando...' : 'Enviar para revisão'}
            </button>
          )}
          {canDecide && (
            <>
              <button disabled={busy !== null} onClick={() => run('approve', () => contractsService.approve(contract.id))} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#059669' }}>
                <CheckCircle2 size={14} /> {busy === 'approve' ? 'Aprovando...' : 'Aprovar'}
              </button>
              <button disabled={busy !== null} onClick={() => setRejecting(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border rounded-lg hover:bg-slate-50 disabled:opacity-50" style={{ borderColor: 'var(--color-border)' }}>
                <RotateCcw size={14} /> Devolver
              </button>
            </>
          )}
          {canReturnApproved && (
            <button disabled={busy !== null} onClick={() => setRejecting(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border rounded-lg hover:bg-slate-50 disabled:opacity-50" style={{ borderColor: 'var(--color-border)' }}>
              <RotateCcw size={14} /> Devolver para ajustes
            </button>
          )}
        </div>
      </div>

      {rejecting && (
        <div className="mt-3 space-y-2 max-w-lg">
          <label htmlFor="reject-reason" className="block text-xs font-medium text-slate-700">Motivo da devolução (obrigatório)</label>
          <textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
          <div className="flex gap-2">
            <button disabled={busy !== null || reason.trim().length < 3} onClick={() => run('reject', () => contractsService.reject(contract.id, reason.trim()))} className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#DC2626' }}>
              {busy === 'reject' ? 'Devolvendo...' : 'Confirmar devolução'}
            </button>
            <button onClick={() => { setRejecting(false); setReason(''); }} className="px-3 py-1.5 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-center gap-2 px-3 py-2 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      {hasHistory && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t text-sm" style={{ borderColor: 'var(--color-border)' }}>
          <div><dt className="text-xs text-slate-400">Enviado por</dt><dd className="font-medium text-slate-800">{review.submittedBy?.name ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-400">Enviado em</dt><dd className="font-medium text-slate-800">{formatDateTime(review.submittedAt)}</dd></div>
          <div><dt className="text-xs text-slate-400">{review.decision === 'rejected' ? 'Devolvido por' : 'Aprovado por'}</dt><dd className="font-medium text-slate-800">{review.decidedBy?.name ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-400">{review.decision === 'rejected' ? 'Devolvido em' : 'Aprovado em'}</dt><dd className="font-medium text-slate-800">{formatDateTime(review.decidedAt)}</dd></div>
          {review.decision === 'rejected' && review.rejectionReason && (
            <div className="col-span-2 md:col-span-4 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
              <span className="font-semibold">Motivo da devolução: </span>{review.rejectionReason}
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
