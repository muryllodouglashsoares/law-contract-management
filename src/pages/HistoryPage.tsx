import { useEffect, useState } from 'react';
import { Clock, Search, FileText, Users, CreditCard, Paperclip, BookOpen, RefreshCw, AlertCircle } from 'lucide-react';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { auditService } from '../services/audit';
import type { AuditLogEntry } from '../types/api';

const entityConfig: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  Contract:         { icon: FileText, color: '#2563EB', bg: '#EFF6FF' },
  Client:           { icon: Users, color: '#D97706', bg: '#FFFBEB' },
  Payment:          { icon: CreditCard, color: '#059669', bg: '#F0FDF4' },
  Document:         { icon: Paperclip, color: '#7C3AED', bg: '#F5F3FF' },
  ContractTemplate: { icon: BookOpen, color: '#2563EB', bg: '#EFF6FF' },
};
const defaultConfig = { icon: RefreshCw, color: '#64748B', bg: '#F1F5F9' };

const PAGE_SIZE = 30;

export default function HistoryPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, error, refetch } = useApiQuery(
    () => auditService.list({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    [page, debouncedSearch],
  );

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const grouped: Record<string, AuditLogEntry[]> = {};
  items.forEach(item => {
    const dateKey = new Date(item.createdAt).toLocaleDateString('pt-BR');
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Histórico de atividades</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Rastreabilidade completa de todas as operações
          </p>
        </div>
      </div>

      <div className="relative max-w-sm mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar no histórico..."
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
          style={{ borderColor: 'var(--color-border)' }}
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{toErrorMessage(error, 'Não foi possível carregar o histórico.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {!loading && Object.entries(grouped).map(([date, dateItems]) => (
        <div key={date} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-xs font-semibold text-slate-500 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{date}</div>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>

          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-px" style={{ backgroundColor: 'var(--color-border)' }} />
            {dateItems.map((item, i) => {
              const cfg = entityConfig[item.entityType] ?? defaultConfig;
              const Icon = cfg.icon;
              const time = new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={item.id} className={`relative ${i < dateItems.length - 1 ? 'mb-5' : ''}`}>
                  <div
                    className="absolute -left-5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white"
                    style={{ backgroundColor: cfg.bg }}
                  >
                    <Icon size={11} style={{ color: cfg.color }} />
                  </div>
                  <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{item.actorName}</span>{' '}
                          {item.action}{' '}
                          <span className="font-medium" style={{ color: 'var(--color-accent)' }}>{item.entityLabel}</span>
                        </p>
                      </div>
                      <span className="text-xs tabular-nums ml-4 flex-shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {time}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!loading && items.length === 0 && !error && (
        <div className="text-center py-12">
          <Clock size={32} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Nenhuma atividade encontrada</p>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Anterior</button>
          <span className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>{pagination.page}</span>
          <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page >= pagination.totalPages} className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Próxima</button>
        </div>
      )}
    </div>
  );
}
