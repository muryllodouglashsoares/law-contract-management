import { AlertCircle, Bell, BellOff, CheckCircle } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

const buttonClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-60 transition-opacity hover:opacity-90';

/** Linha "Notificações do navegador" (Web Push) em Configurações → Preferências. */
export default function BrowserNotificationsSetting() {
  const { user } = useAuth();
  const { state, busy, message, enable, disable, sendTest } = usePushNotifications(user?.id);

  const enabled = state === 'enabled';

  const description: Record<typeof state, string> = {
    loading: 'Verificando...',
    unsupported: 'Este navegador não suporta notificações push.',
    unconfigured: 'Indisponível: o servidor ainda não foi configurado para enviar notificações do navegador.',
    blocked: '',
    enabled: 'Ativadas neste dispositivo',
    disabled: 'Desativadas. Receba avisos de vencimentos e assinaturas mesmo com o sistema fechado.',
  };

  return (
    <div className="py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-slate-500">{enabled ? <Bell size={16} /> : <BellOff size={16} />}</div>
          <div>
            <div className="text-sm font-medium text-slate-800">Notificações do navegador</div>
            {state === 'blocked' ? (
              <div className="flex items-start gap-1.5 text-xs mt-0.5" style={{ color: '#D97706' }}>
                <AlertCircle size={13} className="mt-px flex-shrink-0" />
                <span>
                  As notificações foram bloqueadas pelo navegador. Altere a permissão do site nas configurações do
                  navegador.
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-400">{description[state]}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {enabled && (
            <>
              <button
                onClick={sendTest}
                disabled={busy}
                className={`${buttonClass} border text-slate-700 bg-white`}
                style={{ borderColor: 'var(--color-border)' }}
              >
                Enviar teste
              </button>
              <button
                onClick={disable}
                disabled={busy}
                className={`${buttonClass} border text-slate-700 bg-white`}
                style={{ borderColor: 'var(--color-border)' }}
              >
                Desativar
              </button>
            </>
          )}
          {state === 'disabled' && (
            <button
              onClick={enable}
              disabled={busy}
              className={`${buttonClass} text-white`}
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {busy ? 'Ativando...' : 'Ativar notificações'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          role="status"
          className="flex items-center gap-2 px-3 py-2 mt-3 text-xs rounded-lg"
          style={{
            backgroundColor: message.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            color: message.type === 'success' ? '#059669' : '#DC2626',
          }}
        >
          {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {message.text}
        </div>
      )}
    </div>
  );
}
