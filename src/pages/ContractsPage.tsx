import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, ChevronRight, FileText } from 'lucide-react';
import { contracts } from '../data/mock';
import StatusBadge from '../components/StatusBadge';

const statusFilters = ['Todos', 'Rascunho', 'Enviado', 'Em revisão', 'Assinado', 'Ativo', 'Encerrado', 'Cancelado'];
const statusKey: Record<string, string> = {
  'Todos': 'todos', 'Rascunho': 'rascunho', 'Enviado': 'enviado',
  'Em revisão': 'em_revisao', 'Assinado': 'assinado', 'Ativo': 'ativo',
  'Encerrado': 'encerrado', 'Cancelado': 'cancelado',
};

export default function ContractsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const navigate = useNavigate();

  const filtered = contracts.filter(c => {
    const matchSearch = c.client.toLowerCase().includes(search.toLowerCase()) ||
      String(c.id).includes(search) || c.template.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'Todos' || c.status === statusKey[statusFilter];
    return matchSearch && matchStatus;
  });

  const totalValue = filtered.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Contratos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {contracts.length} contratos · R$ {contracts.reduce((s,c) => s+c.value,0).toLocaleString('pt-BR', {minimumFractionDigits:2})} em valor total
          </p>
        </div>
        <button
          onClick={() => navigate('/contratos/novo')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Novo contrato
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {statusFilters.map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors ${
              statusFilter === f ? 'text-white border-transparent' : 'text-slate-600 bg-white hover:bg-slate-50'
            }`}
            style={statusFilter === f ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : { borderColor: 'var(--color-border)' }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, nº ou modelo..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg bg-white hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>
          <Filter size={13} /> Mais filtros
        </button>
        {filtered.length > 0 && (
          <span className="text-xs ml-auto" style={{ color: 'var(--color-muted-foreground)' }}>
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} · R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Contrato</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Cliente</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Modelo</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right hidden lg:table-cell">Valor</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Criado em</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Atualizado</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">Nenhum contrato encontrado</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Tente ajustar os filtros ou crie um novo contrato</p>
                  <button
                    onClick={() => navigate('/contratos/novo')}
                    className="mt-3 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    Novo contrato
                  </button>
                </td>
              </tr>
            ) : filtered.map((c) => (
              <tr
                key={c.id}
                className="border-b last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => navigate(`/contratos/${c.id}`)}
              >
                <td className="px-5 py-3.5">
                  <span className="text-xs font-mono font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600">#{c.id}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="text-sm font-medium text-slate-900">{c.client}</div>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className="text-xs text-slate-500">{c.template}</span>
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={c.status} size="sm" />
                </td>
                <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                  <span className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-foreground)' }}>
                    R$ {c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-5 py-3.5 hidden lg:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{c.createdAt}</span>
                </td>
                <td className="px-5 py-3.5 hidden lg:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{c.updatedAt}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button className="p-1 rounded hover:bg-slate-100" onClick={e => { e.stopPropagation(); navigate(`/contratos/${c.id}`); }}>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Exibindo {filtered.length} de {contracts.length} contratos
            </span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }} disabled>Anterior</button>
              <button className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>1</button>
              <button className="px-3 py-1 text-xs border rounded bg-white text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
