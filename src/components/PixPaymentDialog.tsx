import { useState } from 'react';
import { AlertCircle, Check, Copy, Info, QrCode, X } from 'lucide-react';
import { toErrorMessage } from '../hooks/useApiQuery';
import { paymentsService } from '../services/payments';
import type { Payment } from '../types/api';
import QrCodeImage from './QrCodeImage';

interface Props {
  payment: Payment;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}

/**
 * Pix "copia e cola" de uma parcela. Apenas INFORMATIVO: exibir, copiar ou gerar o QR Code NÃO baixa a
 * parcela. A baixa é manual (botão "Registrar") depois que alguém confere o recebimento.
 */
export default function PixPaymentDialog({ payment, onClose, onSaved }: Props) {
  const editable = payment.status !== 'pago' && payment.status !== 'cancelado';
  const [form, setForm] = useState({ pixCode: payment.pixCode ?? '', pixKey: payment.pixKey ?? '', pixInstructions: payment.pixInstructions ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await paymentsService.update(payment.id, {
        pixCode: form.pixCode.trim() || null,
        pixKey: form.pixKey.trim() || null,
        pixInstructions: form.pixInstructions.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível salvar os dados do Pix.'));
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o código e copie manualmente.');
    }
  }

  const saved = payment.pixCode;
  const field = 'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white disabled:bg-slate-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="pix-title">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 id="pix-title" className="text-base font-bold text-slate-900">Pix — parcela {payment.installmentNumber}/{payment.installmentTotal}</h2>
            <p className="text-xs text-slate-500">Contrato #{payment.contract.number} · {payment.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="flex items-start gap-2 px-3 py-2 mb-4 text-xs rounded-lg" style={{ backgroundColor: '#EFF6FF', color: '#1E40AF' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          Pagamento via PIX requer confirmação manual. Copiar o código não baixa a parcela: use "Registrar" depois de conferir o recebimento.
        </div>

        {saved && (
          <div className="mb-4 space-y-2">
            <div className="p-3 rounded-lg bg-slate-50 font-mono text-xs break-all select-all">{saved}</div>
            <div className="flex gap-2">
              <button onClick={() => copy(saved)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white rounded-lg hover:opacity-90" style={{ backgroundColor: 'var(--color-primary)' }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar Pix'}
              </button>
              <button onClick={() => setShowQr((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                <QrCode size={14} /> {showQr ? 'Ocultar QR Code' : 'Gerar QR Code'}
              </button>
            </div>
            {showQr && <QrCodeImage value={saved} alt="QR Code do Pix da parcela" />}
            {payment.pixKey && <p className="text-xs text-slate-500">Chave Pix: <span className="font-medium text-slate-700">{payment.pixKey}</span></p>}
            {payment.pixInstructions && <p className="text-xs text-slate-500">{payment.pixInstructions}</p>}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-3 flex items-center gap-2 px-3 py-2 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
            <AlertCircle size={15} className="flex-shrink-0" /> {error}
          </div>
        )}

        {editable ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="pix-code" className="block text-xs font-medium text-slate-700 mb-1.5">Pix copia e cola</label>
              <textarea id="pix-code" rows={3} value={form.pixCode} onChange={(e) => setForm((f) => ({ ...f, pixCode: e.target.value }))} placeholder="Cole aqui o código gerado pelo seu banco" className={`${field} font-mono text-xs`} style={{ borderColor: 'var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="pix-key" className="block text-xs font-medium text-slate-700 mb-1.5">Chave Pix (opcional)</label>
              <input id="pix-key" value={form.pixKey} onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))} className={field} style={{ borderColor: 'var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="pix-instr" className="block text-xs font-medium text-slate-700 mb-1.5">Instruções (opcional)</label>
              <input id="pix-instr" maxLength={500} value={form.pixInstructions} onChange={(e) => setForm((f) => ({ ...f, pixInstructions: e.target.value }))} className={field} style={{ borderColor: 'var(--color-border)' }} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>Fechar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
                {saving ? 'Salvando...' : 'Salvar Pix'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Parcelas pagas ou canceladas não podem ter o Pix alterado.</p>
        )}
      </div>
    </div>
  );
}
