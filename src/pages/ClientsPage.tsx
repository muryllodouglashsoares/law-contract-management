import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, ChevronRight, Users, Building2, User } from 'lucide-react';
import { clients } from '../data/mock';
import StatusBadge from '../components/StatusBadge';

const filterOptions = ['Todos', 'Ativo', 'Inativo'];

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.document.includes(search) || c.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'Todos' || c.status === filter.toLowerCase();
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {clients.length} clientes cadastrados
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou e-mail..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          {filterOptions.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filter === f
                  ? 'text-white border-transparent'
                  : 'text-slate-600 bg-white hover:bg-slate-50'
              }`}
              style={filter === f ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : { borderColor: 'var(--color-border)' }}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg bg-white hover:bg-slate-50 text-slate-600 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
          <Filter size={13} /> Filtros
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Cliente</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">CPF/CNPJ</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Contato</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell text-center">Contratos</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Última atividade</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Users size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">Nenhum cliente encontrado</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Tente outros termos de busca ou adicione um novo cliente</p>
                </td>
              </tr>
            ) : filtered.map((c) => (
              <tr
                key={c.id}
                className="border-b last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => navigate(`/clientes/${c.id}`)}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{c.name}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {c.type === 'PJ' ? <Building2 size={10} className="text-slate-400" /> : <User size={10} className="text-slate-400" />}
                        <span className="text-xs text-slate-400">{c.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className="text-xs tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted-foreground)' }}>{c.document}</span>
                </td>
                <td className="px-5 py-3.5 hidden lg:table-cell">
                  <div className="text-xs text-slate-600">{c.email}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{c.phone}</div>
                </td>
                <td className="px-5 py-3.5 hidden lg:table-cell text-center">
                  <span className="text-sm font-semibold text-slate-700">{c.contracts}</span>
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={c.status} size="sm" />
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{c.lastActivity}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    className="p-1 rounded hover:bg-slate-100"
                    onClick={e => { e.stopPropagation(); navigate(`/clientes/${c.id}`); }}
                  >
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Exibindo {filtered.length} de {clients.length} clientes
            </span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-xs border rounded bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }} disabled>Anterior</button>
              <button className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>1</button>
              <button className="px-3 py-1 text-xs border rounded bg-white hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* New Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Novo cliente</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Preencha as informações do cliente</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome completo / Razão social *</label>
                  <input className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} placeholder="João da Silva" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">CPF / CNPJ *</label>
                  <input className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Telefone</label>
                  <input className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} placeholder="(11) 99999-9999" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">E-mail *</label>
                  <input type="email" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} placeholder="cliente@email.com" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Endereço</label>
                  <input className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} placeholder="Rua, número, bairro, cidade — UF" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Observações</label>
                  <textarea rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none" style={{ borderColor: 'var(--color-border)' }} placeholder="Informações relevantes..." />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Cadastrar cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
