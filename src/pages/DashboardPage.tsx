import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, AlertCircle, CreditCard, TrendingUp,
  Calendar, Clock, ChevronRight, Plus, ArrowUpRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import FinancialDashboard from '../components/FinancialDashboard';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { dashboardService } from '../services/dashboard';

const ACTIVITY_ICONS: Record<string, string> = {
  criou: '📄',
  atualizou: '✏️',
  removeu: '🗑️',
  enviou: '📨',
  'marcou como assinado': '✍',
  'registrou pagamento de': '💳',
  'atualizou o pagamento de': '💳',
  'enviou o documento': '📥',
  'removeu o documento': '🗑️',
  'alterou o status de': '🔄',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

const today = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: summary, loading, error, refetch } = useApiQuery(() => dashboardService.summary(), []);

  const firstName = user?.name.split(' ')[0] ?? '';

  const metrics = summary
    ? [
        {
          label: 'Clientes ativos',
          value: String(summary.metrics.activeClients),
          sub: summary.metrics.newClientsThisMonth > 0 ? `+${summary.metrics.newClientsThisMonth} este mês` : 'Sem novos este mês',
          icon: Users, trend: 'up', color: '#1E3A8A', bg: '#EFF6FF',
        },
        {
          label: 'Contratos ativos',
          value: String(summary.metrics.activeContracts),
          sub: `${summary.metrics.pendingActionContracts} aguardando ação`,
          icon: FileText, trend: 'up', color: '#059669', bg: '#F0FDF4',
        },
        {
          label: 'Aguardando ação',
          value: String(summary.metrics.pendingActionContracts),
          sub: summary.metrics.overduePaymentsCount > 0 ? `${summary.metrics.overduePaymentsCount} pagamento(s) atrasado(s)` : 'Nenhum pagamento atrasado',
          icon: AlertCircle, trend: summary.metrics.overduePaymentsCount > 0 ? 'warn' : 'up', color: '#D97706', bg: '#FFFBEB',
        },
        {
          label: 'A receber',
          value: summary.metrics.receivableNext30Days.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          sub: 'próx. 30 dias',
          icon: CreditCard, trend: 'up', color: '#2563EB', bg: '#EFF6FF',
        },
      ]
    : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
            {greeting()}{firstName ? `, ${firstName}` : ''} 👋
          </h1>
          <p className="text-sm mt-0.5 capitalize" style={{ color: 'var(--color-muted-foreground)' }}>
            {today}
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

      {error && (
        <div className="mb-6 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span>{toErrorMessage(error, 'Não foi possível carregar o dashboard.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      {loading && !summary && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {summary && (
        <>
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
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                    {summary.contractStatusChart.reduce((sum, s) => sum + s.value, 0)} contratos no total
                  </p>
                </div>
                <TrendingUp size={16} className="text-slate-400" />
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={summary.contractStatusChart} barSize={28} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    cursor={{ fill: '#F8FAFC' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {summary.contractStatusChart.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4">
                {summary.contractStatusChart.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-slate-500">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming payments */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Próximos vencimentos</h2>
                <Calendar size={15} className="text-slate-400" />
              </div>
              {summary.upcomingPayments.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--color-muted-foreground)' }}>
                  Nenhum pagamento previsto nos próximos 30 dias.
                </p>
              ) : (
                <div className="space-y-3">
                  {summary.upcomingPayments.map((p) => {
                    const dueDate = new Date(p.dueDate);
                    const urgent = dueDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                    return (
                      <div key={p.id} className="flex items-start gap-3">
                        <div
                          className="text-xs font-semibold rounded-md px-2 py-1 flex-shrink-0 mt-0.5 tabular-nums"
                          style={{
                            backgroundColor: urgent ? '#FEF2F2' : '#F1F5F9',
                            color: urgent ? '#DC2626' : '#64748B',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </div>
                        <span className="text-xs text-slate-700 leading-snug">
                          Parcela {p.installmentNumber}/{p.installmentTotal} · {p.contract.client.name} — {p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                onClick={() => navigate('/pagamentos')}
                className="w-full mt-4 text-xs font-medium py-2 rounded-lg border hover:bg-slate-50 transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
              >
                Ver todos os pagamentos
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
              {summary.recentContracts.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--color-muted-foreground)' }}>
                  Nenhum contrato cadastrado ainda.
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {summary.recentContracts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/contratos/${c.id}`)}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ backgroundColor: '#EFF6FF', color: 'var(--color-primary)' }}>
                        #{c.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{c.client.name}</div>
                        <div className="text-xs text-slate-500 truncate">{c.template.name}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <StatusBadge status={c.status} size="sm" />
                        <div className="text-xs text-slate-500 mt-1 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                          {c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">Atividade recente</h2>
                <button onClick={() => navigate('/historico')} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                  Ver histórico <ChevronRight size={13} />
                </button>
              </div>
              {summary.recentActivity.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--color-muted-foreground)' }}>
                  Nenhuma atividade registrada ainda.
                </p>
              ) : (
                <div className="px-5 pb-4 space-y-3">
                  {summary.recentActivity.map((item) => {
                    const date = new Date(item.createdAt);
                    return (
                      <div key={item.id} className="flex items-start gap-3">
                        <div className="text-base flex-shrink-0 mt-0.5">{ACTIVITY_ICONS[item.action] ?? '•'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700">
                            <span className="font-medium">{item.actorName}</span>{' '}
                            {item.action}{' '}
                            <span className="font-medium" style={{ color: 'var(--color-accent)' }}>{item.entityLabel}</span>
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={10} className="text-slate-400" />
                            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                              {date.toLocaleDateString('pt-BR')} · {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <FinancialDashboard />
    </div>
  );
}
