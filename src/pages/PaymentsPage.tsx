import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, AlertCircle, Clock, CreditCard, Search, Plus, Check } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { paymentsService } from '../services/payments';
import { contractsService } from '../services/contracts';
import type { Payment, PaymentMethodApi, PaymentStatusApi } from '../types/api';

const filters: { label: string; value: PaymentStatusApi | undefined }[] = [
  { label: 'Todos', value: undefined },
  { label: 'Pago', value: 'pago' },
  { label: 'Pendente', value: 'pendente' },
  { label: 'Atrasado', value: 'atrasado' },
  { label: 'A vencer', value: 'futuro' },
];

const PAYMENT_METHODS: PaymentMethodApi[] = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão'];
const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatusApi | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: summary } = useApiQuery(() => paymentsService.summary(), []);
  const { data, loading, error, refetch } = useApiQuery(
    () => paymentsService.list({ page, pageSize: PAGE_SIZE, status: statusFilter }),
    [page, statusFilter],
  );
  const { data: contractsData } = useApiQuery(() => contractsService.list({ pageSize: 100 }), []);

  const payments = data?.data ?? [];
  const pagination = data?.pagination;
  const contracts = contractsData?.data ?? [];

  const filteredBySearch = search
    ? payments.filter(p => p.contract.client.name.toLowerCase().includes(search.toLowerCase()) || String(p.contract.number).includes(search))
    : payments;

  // --- Registrar pagamento existente (marcar como pago) -----------------
  const [registering, setRegistering] = useState<Payment | null>(null);
  const [registerMethod, setRegisterMethod] = useState<PaymentMethodApi>('PIX');
  const [registerSaving, setRegisterSaving] = useState(false);

  async function confirmRegister() {
    if (!registering) return;
    setRegisterSaving(true);
    try {
      await paymentsService.registerPayment(registering.id, { method: registerMethod });
      setRegistering(null);
      refetch();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível registrar o pagamento.'));
    } finally {
      setRegisterSaving(false);
    }
  }

  // --- Nova parcela (qualquer contrato) ----------------------------------
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ contractId: '', installmentNumber: '1', installmentTotal: '1', value: '', dueDate: '' });
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  async function handleCreate() {
    setNewError(null);
    if (!newForm.contractId) { setNewError('Selecione o contrato.'); return; }
    setNewSaving(true);
    try {
      await paymentsService.create({
        contractId: newForm.contractId,
        installmentNumber: Number(newForm.installmentNumber),
        installmentTotal: Number(newForm.installmentTotal),
        value: Number(newForm.value),
        dueDate: newForm.dueDate,
      });
      setShowNew(false);
      setNewForm({ contractId: '', installmentNumber: '1', installmentTotal: '1', value: '', dueDate: '' });
      refetch();
    } catch (err) {
      setNewError(toErrorMessage(err, 'Não foi possível registrar a parcela.'));
    } finally {
      setNewSaving(false);
    }
  }

  const metrics = summary ? [
    { label: 'Total recebido', value: summary.totalPaid, icon: TrendingUp, color: '#059669', bg: '#F0FDF4' },
    { label: 'Pendente', value: summary.totalPending, icon: Clock, color: '#D97706', bg: '#FFFBEB' },
    { label: 'Atrasado', value: summary.totalOverdue, icon: AlertCircle, color: '#DC2626', bg: '#FEF2F2' },
    { label: 'Próx. 30 dias', value: summary.receivableNext30Days, icon: CreditCard, color: '#2563EB', bg: '#EFF6FF' },
  ] : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Pagamentos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Controle financeiro do escritório</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Registrar pagamento
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map(m => (
          <div key={m.label} className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: m.bg }}>
                <m.icon size={16} style={{ color: m.color }} />
              </div>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: m.color, fontFamily: 'var(--font-display)' }}>
              {m.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou nº do contrato..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
            style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div className="flex items-center gap-2">
          {filters.map(f => (
            <button key={f.label} onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors ${statusFilter === f.value ? 'text-white border-transparent' : 'text-slate-600 bg-white hover:bg-slate-50'}`}
              style={statusFilter === f.value ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : { borderColor: 'var(--color-border)' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{toErrorMessage(error, 'Não foi possível carregar os pagamentos.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
              {['Cliente', 'Contrato', 'Parcela', 'Valor', 'Vencimento', 'Status', 'Ações'].map(h => (
                <th key={h} className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${h === 'Valor' || h === 'Ações' ? 'text-right' : ''} ${['Parcela','Vencimento'].includes(h) ? 'hidden md:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-16 text-center">
                <div className="w-6 h-6 mx-auto rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              </td></tr>
            ) : filteredBySearch.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center">
                <CreditCard size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Nenhum pagamento encontrado</p>
              </td></tr>
            ) : filteredBySearch.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{p.contract.client.name}</td>
                <td className="px-5 py-3.5">
                  <span
                    className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded cursor-pointer hover:bg-slate-200"
                    onClick={() => navigate(`/contratos/${p.contract.id}`)}
                  >
                    #{p.contract.number}
                  </span>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate-500">{p.installmentNumber}/{p.installmentTotal}</td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    {p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(p.dueDate).toLocaleDateString('pt-BR')}
                  </span>
                </td>
                <td className="px-5 py-3.5"><StatusBadge status={p.status} size="sm" /></td>
                <td className="px-5 py-3.5 text-right">
                  {p.status !== 'pago' && p.status !== 'cancelado' && (
                    <button
                      onClick={() => { setRegistering(p); setRegisterMethod('PIX'); }}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#059669' }}
                    >
                      Registrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Exibindo {payments.length} de {pagination.total}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Anterior</button>
              <span className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>{pagination.page}</span>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page >= pagination.totalPages} className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* Register (mark as paid) modal */}
      {registering && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Registrar pagamento</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                {registering.contract.client.name} · Parcela {registering.installmentNumber}/{registering.installmentTotal} · {registering.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Método de pagamento</label>
              <select value={registerMethod} onChange={e => setRegisterMethod(e.target.value as PaymentMethodApi)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white" style={{ borderColor: 'var(--color-border)' }}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setRegistering(null)} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              <button onClick={confirmRegister} disabled={registerSaving} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#059669' }}>
                {registerSaving ? 'Registrando...' : <><Check size={14} className="inline mr-1" />Confirmar pagamento</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New payment modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Nova parcela</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {newError && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  <AlertCircle size={15} className="flex-shrink-0" /> {newError}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Contrato *</label>
                <select value={newForm.contractId} onChange={e => setNewForm(f => ({ ...f, contractId: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg bg-white" style={{ borderColor: 'var(--color-border)' }}>
                  <option value="">Selecione...</option>
                  {contracts.map(c => <option key={c.id} value={c.id}>#{c.number} · {c.client.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Parcela nº</label>
                  <input type="number" min={1} value={newForm.installmentNumber} onChange={e => setNewForm(f => ({ ...f, installmentNumber: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Total de parcelas</label>
                  <input type="number" min={1} value={newForm.installmentTotal} onChange={e => setNewForm(f => ({ ...f, installmentTotal: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Valor (R$) *</label>
                <input type="number" placeholder="0,00" value={newForm.value} onChange={e => setNewForm(f => ({ ...f, value: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Vencimento *</label>
                <input type="date" value={newForm.dueDate} onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              <button onClick={handleCreate} disabled={newSaving} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
                {newSaving ? 'Salvando...' : 'Criar parcela'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
