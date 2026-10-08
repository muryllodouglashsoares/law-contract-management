import { useState } from 'react';
import { AlertCircle, ListPlus, X } from 'lucide-react';
import { toErrorMessage } from '../hooks/useApiQuery';
import { paymentsService } from '../services/payments';
import type { InstallmentPreview } from '../types/api';

interface Props {
  contract: { id: string; number: number; value: number };
  onClose: () => void;
  onGenerated: () => void | Promise<unknown>;
}

const BRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Geração automática de parcelas. A PRÉVIA vem do backend (centavos exatos, vencimentos com o dia
 * preservado): o frontend não calcula nada financeiro. Gerar só é possível se o contrato ainda não tem parcelas.
 */
export default function GenerateInstallmentsDialog({ contract, onClose, onGenerated }: Props) {
  const [form, setForm] = useState({ totalValue: String(contract.value), installmentCount: '12', firstDueDate: '' });
  const [preview, setPreview] = useState<InstallmentPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'generate' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = () => ({
    contractId: contract.id,
    totalValue: Number(form.totalValue.replace(',', '.')),
    installmentCount: Number(form.installmentCount),
    firstDueDate: form.firstDueDate,
  });
  const formValid = Number(form.totalValue.replace(',', '.')) > 0 && Number(form.installmentCount) >= 1 && form.firstDueDate !== '';

  function edit(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
    setPreview(null); // qualquer alteração invalida a prévia mostrada
  }

  async function calculate() {
    setBusy('preview');
    setError(null);
    try {
      setPreview(await paymentsService.previewInstallments(input()));
    } catch (err) {
      setPreview(null);
      setError(toErrorMessage(err, 'Não foi possível calcular a prévia.'));
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy('generate');
    setError(null);
    try {
      await paymentsService.generateInstallments(input());
      await onGenerated();
      onClose();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível gerar as parcelas.'));
    } finally {
      setBusy(null);
    }
  }

  const blocked = (preview?.existingCount ?? 0) > 0;
  const field = 'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="gen-title">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 id="gen-title" className="text-base font-bold text-slate-900 flex items-center gap-2"><ListPlus size={16} /> Gerar parcelas — contrato #{contract.number}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="gen-total" className="block text-xs font-medium text-slate-700 mb-1.5">Valor total (R$)</label>
            <input id="gen-total" inputMode="decimal" value={form.totalValue} onChange={(e) => edit({ totalValue: e.target.value })} className={field} style={{ borderColor: 'var(--color-border)' }} />
          </div>
          <div>
            <label htmlFor="gen-count" className="block text-xs font-medium text-slate-700 mb-1.5">Nº de parcelas</label>
            <input id="gen-count" type="number" min={1} max={120} value={form.installmentCount} onChange={(e) => edit({ installmentCount: e.target.value })} className={field} style={{ borderColor: 'var(--color-border)' }} />
          </div>
          <div>
            <label htmlFor="gen-date" className="block text-xs font-medium text-slate-700 mb-1.5">1º vencimento</label>
            <input id="gen-date" type="date" value={form.firstDueDate} onChange={(e) => edit({ firstDueDate: e.target.value })} className={field} style={{ borderColor: 'var(--color-border)' }} />
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-3 flex items-center gap-2 px-3 py-2 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
            <AlertCircle size={15} className="flex-shrink-0" /> {error}
          </div>
        )}

        {preview && (
          <div className="mt-4">
            {blocked && (
              <div role="alert" className="mb-3 flex items-start gap-2 px-3 py-2 text-sm rounded-lg" style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                Este contrato já possui {preview.existingCount} parcela(s). Para evitar duplicidade, cancele as existentes antes de gerar um novo parcelamento.
              </div>
            )}
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr><th className="text-left px-3 py-2 font-medium">Parcela</th><th className="text-left px-3 py-2 font-medium">Vencimento</th><th className="text-right px-3 py-2 font-medium">Valor</th></tr>
                  </thead>
                  <tbody>
                    {preview.installments.map((item) => (
                      <tr key={item.installmentNumber} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="px-3 py-1.5">{item.installmentNumber}/{item.installmentTotal}</td>
                        <td className="px-3 py-1.5 tabular-nums">{new Date(item.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{BRL(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between px-3 py-2 border-t bg-slate-50 text-sm font-semibold" style={{ borderColor: 'var(--color-border)' }}>
                <span>Total</span><span className="tabular-nums">{BRL(preview.totalValue)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
          <button onClick={calculate} disabled={!formValid || busy !== null} className="px-4 py-2 text-sm font-semibold border rounded-lg disabled:opacity-50" style={{ borderColor: 'var(--color-border)' }}>
            {busy === 'preview' ? 'Calculando...' : preview ? 'Recalcular' : 'Ver prévia'}
          </button>
          <button onClick={generate} disabled={!preview || blocked || busy !== null} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {busy === 'generate' ? 'Gerando...' : 'Gerar parcelas'}
          </button>
        </div>
      </div>
    </div>
  );
}
