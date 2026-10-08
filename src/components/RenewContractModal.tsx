import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { toErrorMessage } from '../hooks/useApiQuery';
import { formatDateOnly } from '../lib/contract-dates';
import { contractsService } from '../services/contracts';
import type { Contract } from '../types/api';

interface Props {
  contract: Contract;
  onClose: () => void;
  onRenewed: () => void | Promise<unknown>;
}

const BRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor reajustado em CENTAVOS inteiros (apenas pré-visualização; o backend recalcula em Decimal). */
function previewAdjusted(value: number, percent: number): number {
  return Math.round(value * 100 * (1 + percent / 100)) / 100;
}

export default function RenewContractModal({ contract, onClose, onRenewed }: Props) {
  const [newEndDate, setNewEndDate] = useState('');
  const [percent, setPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const percentNumber = percent.trim() === '' ? null : Number(percent.replace(',', '.'));
  const percentValid = percentNumber === null || (Number.isFinite(percentNumber) && percentNumber > -100 && percentNumber <= 1000);
  const newValue = useMemo(
    () => (percentNumber !== null && percentValid ? previewAdjusted(contract.value, percentNumber) : contract.value),
    [contract.value, percentNumber, percentValid],
  );
  const currentEnd = (contract.endDate ?? contract.startDate).slice(0, 10);
  const dateValid = newEndDate > currentEnd;

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await contractsService.renew(contract.id, {
        newEndDate,
        ...(percentNumber !== null ? { adjustmentPercent: percentNumber } : {}),
      });
      await onRenewed();
      onClose();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível renovar o contrato.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="renew-title">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 id="renew-title" className="text-base font-bold text-slate-900 flex items-center gap-2"><RefreshCw size={16} /> Renovar contrato #{contract.number}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="renew-date" className="block text-xs font-medium text-slate-700 mb-1.5">
              Nova data de término <span className="text-slate-400">(atual: {contract.endDate ? formatDateOnly(contract.endDate) : 'sem término'})</span>
            </label>
            <input id="renew-date" type="date" min={currentEnd} value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
            {newEndDate && !dateValid && <p className="text-xs mt-1 text-red-600">A nova data deve ser posterior à atual.</p>}
          </div>
          <div>
            <label htmlFor="renew-percent" className="block text-xs font-medium text-slate-700 mb-1.5">Reajuste (%) — opcional</label>
            <input id="renew-percent" inputMode="decimal" placeholder="ex.: 5 ou 4,5" value={percent} onChange={(e) => setPercent(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
            {!percentValid && <p className="text-xs mt-1 text-red-600">Informe um percentual válido.</p>}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Valor atual</span><span className="tabular-nums">{BRL(contract.value)}</span></div>
            <div className="flex justify-between font-semibold"><span>Novo valor</span><span className="tabular-nums">{BRL(newValue)}</span></div>
          </div>
          <p className="text-xs text-slate-500">
            A renovação cria uma <strong>nova versão</strong> do contrato (a versão assinada e seu PDF permanecem intactos) e reinicia os alertas de renovação.
          </p>
        </div>

        {error && (
          <div role="alert" className="mt-3 flex items-center gap-2 px-3 py-2 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
            <AlertCircle size={15} className="flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving || !dateValid || !percentValid} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? 'Renovando...' : 'Confirmar renovação'}
          </button>
        </div>
      </div>
    </div>
  );
}
