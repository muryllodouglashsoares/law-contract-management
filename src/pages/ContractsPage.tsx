import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronRight, FileText, AlertCircle } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { contractsService } from '../services/contracts';
import type { ContractStatusApi } from '../types/api';

const statusFilters: { label: string; value: ContractStatusApi | undefined }[] = [
  { label: 'Todos', value: undefined },
  { label: 'Rascunho', value: 'rascunho' },
  { label: 'Pronto p/ envio', value: 'pronto_envio' },
  { label: 'Enviado', value: 'enviado' },
  { label: 'Em revisão', value: 'em_revisao' },
  { label: 'Assinado', value: 'assinado' },
  { label: 'Ativo', value: 'ativo' },
  { label: 'Encerrado', value: 'encerrado' },
  { label: 'Cancelado', value: 'cancelado' },
];

const PAGE_SIZE = 20;

export default function ContractsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContractStatusApi | undefined>(undefined);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, loading, error, refetch } = useApiQuery(
    () => contractsService.list({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, status: statusFilter }),
    [page, debouncedSearch, statusFilter],
  );

  const contracts = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Contratos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {pagination ? `${pagination.total} contratos cadastrados` : 'Carregando...'}
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
            key={f.label}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors ${
              statusFilter === f.value ? 'text-white border-transparent' : 'text-slate-600 bg-white hover:bg-slate-50'
            }`}
            style={statusFilter === f.value ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : { borderColor: 'var(--color-border)' }}
          >
            {f.label}
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
            placeholder="Buscar por cliente ou objeto..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
        {pagination && pagination.total > 0 && (
          <span className="text-xs ml-auto" style={{ color: 'var(--color-muted-foreground)' }}>
            {pagination.total} resultado{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{toErrorMessage(error, 'Não foi possível carregar os contratos.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

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
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-16 text-center">
                <div className="w-6 h-6 mx-auto rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              </td></tr>
            ) : contracts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
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
            ) : contracts.map((c) => (
              <tr
                key={c.id}
                className="border-b last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
                onClick={() => navigate(`/contratos/${c.id}`)}
              >
                <td className="px-5 py-3.5">
                  <span className="text-xs font-mono font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600">#{c.number}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="text-sm font-medium text-slate-900">{c.client.name}</div>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className="text-xs text-slate-500">{c.template.name}</span>
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={c.status} size="sm" />
                </td>
                <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                  <span className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-foreground)' }}>
                    {c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </td>
                <td className="px-5 py-3.5 hidden lg:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </span>
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
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Exibindo {contracts.length} de {pagination.total} contratos
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>
                {pagination.page}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
