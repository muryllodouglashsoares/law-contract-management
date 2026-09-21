import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, AlertCircle, CreditCard, TrendingUp,
  Calendar, Clock, ChevronRight, Plus, ArrowUpRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { contracts, payments, notifications, history, contractStatusChart } from '../data/mock';
import StatusBadge from '../components/StatusBadge';

const metrics = [
  { label: 'Clientes ativos', value: '14', sub: '+2 este mês', icon: Users, trend: 'up', color: '#1E3A8A', bg: '#EFF6FF' },
  { label: 'Contratos ativos', value: '8', sub: '3 renovam em 30d', icon: FileText, trend: 'up', color: '#059669', bg: '#F0FDF4' },
  { label: 'Aguardando ação', value: '3', sub: '1 urgente', icon: AlertCircle, trend: 'warn', color: '#D97706', bg: '#FFFBEB' },
  { label: 'A receber', value: 'R$ 6.400', sub: 'próx. 30 dias', icon: CreditCard, trend: 'up', color: '#2563EB', bg: '#EFF6FF' },
];

const upcomingEvents = [
  { date: '22/09', label: 'Vencimento contrato #102', type: 'contract', urgent: false },
  { date: '25/09', label: 'Pagamento ABC Ltda. — R$ 3.000', type: 'payment', urgent: true },
  { date: '30/09', label: 'Parcela Maria Oliveira — R$ 1.200', type: 'payment', urgent: true },
  { date: '01/10', label: 'Encerramento contrato #97', type: 'contract', urgent: false },
  { date: '15/10', label: 'Revisão assessoria Tech Solutions', type: 'info', urgent: false },
];

const activityIcons: Record<string, string> = {
  create: '📄', pdf: '📥', send: '📨', view: '👁', sign: '✍', payment: '💳', update: '✏️',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [chartMode] = useState<'bar'>('bar');

  const recentContracts = contracts.slice(0, 4);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
            Bom dia, Muryllo 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Segunda-feira, 21 de setembro de 2026
          </p>
        </div>
        <button
          onClick={() => navigate('/contratos/novo')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Novo contrato
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white rounded-xl p-4 border" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: m.bg }}>
                <m.icon size={16} style={{ color: m.color }} />
              </div>
              <ArrowUpRight size={14} className="text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{m.value}</div>
            <div className="text-xs text-slate-600 mt-0.5">{m.label}</div>
            <div className="text-xs mt-1" style={{ color: m.trend === 'warn' ? 'var(--color-warning)' : 'var(--color-success)' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Contratos por status</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>28 contratos no total</p>
            </div>
            <TrendingUp size={16} className="text-slate-400" />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={contractStatusChart} barSize={28} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                cursor={{ fill: '#F8FAFC' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {contractStatusChart.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4">
            {contractStatusChart.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-slate-500">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming events */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Próximos eventos</h2>
            <Calendar size={15} className="text-slate-400" />
          </div>
          <div className="space-y-3">
            {upcomingEvents.map((ev, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="text-xs font-semibold rounded-md px-2 py-1 flex-shrink-0 mt-0.5 tabular-nums"
                  style={{
                    backgroundColor: ev.urgent ? '#FEF2F2' : '#F1F5F9',
                    color: ev.urgent ? '#DC2626' : '#64748B',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {ev.date}
                </div>
                <span className="text-xs text-slate-700 leading-snug">{ev.label}</span>
              </div>
            ))}
          </div>
          <button
            className="w-full mt-4 text-xs font-medium py-2 rounded-lg border hover:bg-slate-50 transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
          >
            Ver agenda completa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Recent contracts */}
        <div className="bg-white rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Contratos recentes</h2>
            <button onClick={() => navigate('/contratos')} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {recentContracts.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/contratos/${c.id}`)}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ backgroundColor: '#EFF6FF', color: 'var(--color-primary)' }}>
                  #{c.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{c.client}</div>
                  <div className="text-xs text-slate-500 truncate">{c.template}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <StatusBadge status={c.status} size="sm" />
                  <div className="text-xs text-slate-500 mt-1 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    R$ {c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Atividade recente</h2>
            <button onClick={() => navigate('/historico')} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
              Ver histórico <ChevronRight size={13} />
            </button>
          </div>
          <div className="px-5 pb-4 space-y-3">
            {history.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="text-base flex-shrink-0 mt-0.5">{activityIcons[item.type] ?? '•'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700">
                    <span className="font-medium">{item.user}</span>{' '}
                    {item.action}{' '}
                    <span className="font-medium" style={{ color: 'var(--color-accent)' }}>{item.target}</span>
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={10} className="text-slate-400" />
                    <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      {item.date} · {item.time}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
