import { useState } from 'react';
import { Clock, Search, FileText, Users, CreditCard, Mail, Eye, PenTool, RefreshCw } from 'lucide-react';
import { history } from '../data/mock';

const typeConfig: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  create:  { icon: FileText, color: '#2563EB', bg: '#EFF6FF' },
  pdf:     { icon: FileText, color: '#7C3AED', bg: '#F5F3FF' },
  send:    { icon: Mail, color: '#059669', bg: '#F0FDF4' },
  view:    { icon: Eye, color: '#D97706', bg: '#FFFBEB' },
  sign:    { icon: PenTool, color: '#059669', bg: '#F0FDF4' },
  payment: { icon: CreditCard, color: '#2563EB', bg: '#EFF6FF' },
  update:  { icon: RefreshCw, color: '#64748B', bg: '#F1F5F9' },
};

export default function HistoryPage() {
  const [search, setSearch] = useState('');

  const filtered = history.filter(h =>
    h.user.toLowerCase().includes(search.toLowerCase()) ||
    h.target.toLowerCase().includes(search.toLowerCase()) ||
    h.action.toLowerCase().includes(search.toLowerCase())
  );

  const grouped: Record<string, typeof history> = {};
  filtered.forEach(h => {
    if (!grouped[h.date]) grouped[h.date] = [];
    grouped[h.date].push(h);
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

      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-xs font-semibold text-slate-500 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{date}</div>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>

          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-px" style={{ backgroundColor: 'var(--color-border)' }} />
            {items.map((item, i) => {
              const cfg = typeConfig[item.type] ?? typeConfig.create;
              const Icon = cfg.icon;
              return (
                <div key={item.id} className={`relative ${i < items.length - 1 ? 'mb-5' : ''}`}>
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
                          <span className="font-semibold text-slate-900">{item.user}</span>{' '}
                          {item.action}{' '}
                          <span className="font-medium" style={{ color: 'var(--color-accent)' }}>{item.target}</span>
                        </p>
                      </div>
                      <span className="text-xs tabular-nums ml-4 flex-shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {item.time}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Clock size={32} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Nenhuma atividade encontrada</p>
        </div>
      )}
    </div>
  );
}
