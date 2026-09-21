import { useState } from 'react';
import { TrendingUp, AlertCircle, Clock, CreditCard, Search, Filter, Plus } from 'lucide-react';
import { payments } from '../data/mock';
import StatusBadge from '../components/StatusBadge';

export default function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [showModal, setShowModal] = useState(false);

  const totalPaid = payments.filter(p => p.status === 'pago').reduce((s, p) => s + p.value, 0);
  const totalPending = payments.filter(p => p.status === 'pendente').reduce((s, p) => s + p.value, 0);
  const totalOverdue = payments.filter(p => p.status === 'atrasado').reduce((s, p) => s + p.value, 0);

  const filters = ['Todos', 'Pago', 'Pendente', 'Atrasado', 'A vencer'];
  const filterMap: Record<string, string> = { 'Todos': 'todos', 'Pago': 'pago', 'Pendente': 'pendente', 'Atrasado': 'atrasado', 'A vencer': 'futuro' };

  const filtered = payments.filter(p => {
    const matchSearch = p.client.toLowerCase().includes(search.toLowerCase()) || String(p.contractId).includes(search);
    const matchStatus = statusFilter === 'Todos' || p.status === filterMap[statusFilter];
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Pagamentos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Controle financeiro do escritório</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Registrar pagamento
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total recebido', value: `R$ ${totalPaid.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, icon: TrendingUp, color: '#059669', bg: '#F0FDF4' },
          { label: 'Pendente', value: `R$ ${totalPending.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, icon: Clock, color: '#D97706', bg: '#FFFBEB' },
          { label: 'Atrasado', value: `R$ ${totalOverdue.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, icon: AlertCircle, color: '#DC2626', bg: '#FEF2F2' },
          { label: 'Próx. 30 dias', value: 'R$ 4.600,00', icon: CreditCard, color: '#2563EB', bg: '#EFF6FF' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: m.bg }}>
                <m.icon size={16} style={{ color: m.color }} />
              </div>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: m.color, fontFamily: 'var(--font-display)' }}>{m.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou contrato..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
            style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div className="flex items-center gap-2">
          {filters.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors ${statusFilter === f ? 'text-white border-transparent' : 'text-slate-600 bg-white hover:bg-slate-50'}`}
              style={statusFilter === f ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : { borderColor: 'var(--color-border)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

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
            {filtered.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{p.client}</td>
                <td className="px-5 py-3.5">
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">#{p.contractId}</span>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate-500">{p.installment}</td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    R$ {p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{p.dueDate}</span>
                </td>
                <td className="px-5 py-3.5"><StatusBadge status={p.status} size="sm" /></td>
                <td className="px-5 py-3.5 text-right">
                  {p.status !== 'pago' && (
                    <button onClick={() => setShowModal(true)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: '#059669' }}>
                      Registrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Registrar pagamento</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Valor recebido *</label>
                <input type="number" placeholder="0,00" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Data do pagamento *</label>
                <input type="date" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Método de pagamento</label>
                <select className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white" style={{ borderColor: 'var(--color-border)' }}>
                  <option>PIX</option><option>Transferência bancária</option><option>Boleto</option><option>Dinheiro</option><option>Cartão</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Observação</label>
                <textarea rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none" style={{ borderColor: 'var(--color-border)' }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90" style={{ backgroundColor: '#059669' }}>Confirmar pagamento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
