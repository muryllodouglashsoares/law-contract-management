import { Bell, AlertCircle, CheckCircle, Info, Check, AlertTriangle } from 'lucide-react';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { notificationsService } from '../services/notifications';
import type { NotificationType } from '../types/api';

const typeIcon: Record<NotificationType, typeof Info> = {
  WARNING: AlertTriangle,
  SUCCESS: CheckCircle,
  INFO: Info,
  ERROR: AlertCircle,
};

const typeColor: Record<NotificationType, { icon: string; bg: string; border: string }> = {
  WARNING: { icon: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  SUCCESS: { icon: '#059669', bg: '#F0FDF4', border: '#A7F3D0' },
  INFO: { icon: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  ERROR: { icon: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

export default function NotificationsPage() {
  const { data, loading, error, refetch } = useApiQuery(
    () => notificationsService.list({ pageSize: 50 }),
    [],
  );

  const all = data?.data ?? [];
  const unread = all.filter(n => !n.read);
  const read = all.filter(n => n.read);

  async function handleMarkRead(id: string) {
    try {
      await notificationsService.markRead(id);
      refetch();
    } catch {
      // silencioso: não é crítico o suficiente para interromper o usuário
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationsService.markAllRead();
      refetch();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível marcar as notificações como lidas.'));
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Notificações</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {loading ? 'Carregando...' : `${unread.length} não lida${unread.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {unread.length > 0 && (
          <button onClick={handleMarkAllRead} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
            <Check size={14} /> Marcar todas como lidas
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{toErrorMessage(error, 'Não foi possível carregar as notificações.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {!loading && unread.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Bell size={11} /> Não lidas
          </div>
          <div className="space-y-2">
            {unread.map(n => {
              const Icon = typeIcon[n.type] ?? Info;
              const colors = typeColor[n.type] ?? typeColor.INFO;
              return (
                <div
                  key={n.id}
                  onClick={() => handleMarkRead(n.id)}
                  className="flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-opacity hover:opacity-90"
                  style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon size={16} style={{ color: colors.icon }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{n.description}</div>
                      </div>
                      {n.priority && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                          Urgente
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-2 tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(n.createdAt).toLocaleDateString('pt-BR')} · {new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && read.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Anteriores</div>
          <div className="space-y-2">
            {read.map(n => {
              const Icon = typeIcon[n.type] ?? Info;
              return (
                <div
                  key={n.id}
                  className="flex items-start gap-4 p-4 rounded-xl border bg-white"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon size={16} className="text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-600">{n.title}</div>
                    <div className="text-sm text-slate-400 mt-0.5">{n.description}</div>
                    <div className="text-xs mt-2 tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(n.createdAt).toLocaleDateString('pt-BR')} · {new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && all.length === 0 && !error && (
        <div className="text-center py-16">
          <Bell size={36} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Nenhuma notificação</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Você está em dia!</p>
        </div>
      )}
    </div>
  );
}
