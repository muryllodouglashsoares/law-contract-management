import { Bell, AlertCircle, CheckCircle, Info, Check } from 'lucide-react';
import { notifications } from '../data/mock';

const typeIcon = {
  warning: AlertCircle,
  success: CheckCircle,
  info: Info,
  error: AlertCircle,
};

const typeColor = {
  warning: { icon: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  success: { icon: '#059669', bg: '#F0FDF4', border: '#A7F3D0' },
  info: { icon: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  error: { icon: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

export default function NotificationsPage() {
  const unread = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Notificações</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {unread.length} não lida{unread.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
          <Check size={14} /> Marcar todas como lidas
        </button>
      </div>

      {unread.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Bell size={11} /> Não lidas
          </div>
          <div className="space-y-2">
            {unread.map(n => {
              const Icon = typeIcon[n.type as keyof typeof typeIcon] ?? Info;
              const colors = typeColor[n.type as keyof typeof typeColor] ?? typeColor.info;
              return (
                <div
                  key={n.id}
                  className="flex items-start gap-4 p-4 rounded-xl border"
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
                      {n.date}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {read.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Anteriores</div>
          <div className="space-y-2">
            {read.map(n => {
              const Icon = typeIcon[n.type as keyof typeof typeIcon] ?? Info;
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
                      {n.date}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {notifications.length === 0 && (
        <div className="text-center py-16">
          <Bell size={36} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Nenhuma notificação</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Você está em dia!</p>
        </div>
      )}
    </div>
  );
}
