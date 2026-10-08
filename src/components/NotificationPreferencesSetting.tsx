import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { toErrorMessage, useApiQuery } from '../hooks/useApiQuery';
import { usersService } from '../services/users';
import type { NotificationPreferences } from '../types/api';

type Key = keyof NotificationPreferences;

const ITEMS: { key: Key; label: string; desc: string }[] = [
  { key: 'emailEnabled', label: 'E-mail', desc: 'Receber alertas e avisos por e-mail (quando o envio automático estiver configurado no servidor)' },
  { key: 'whatsappEnabled', label: 'WhatsApp', desc: 'Preferência para envios automáticos futuros. O botão "Enviar por WhatsApp" continua manual.' },
  { key: 'pushEnabled', label: 'Alertas push no navegador', desc: 'Silenciar ou receber os avisos push. A permissão do navegador é ativada acima.' },
];

/**
 * Preferências de canal PERSISTIDAS no backend (por usuário). Cada alteração é salva na hora; o estado
 * exibido é sempre o do servidor (volta correto após logout/login).
 */
export default function NotificationPreferencesSetting() {
  const { data, loading, error, refetch } = useApiQuery(() => usersService.getNotificationPreferences(), []);
  const [saving, setSaving] = useState<Key | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [override, setOverride] = useState<Partial<NotificationPreferences>>({});

  const preferences = data ? { ...data.preferences, ...override } : null;

  async function toggle(key: Key) {
    if (!preferences || saving) return;
    const next = !preferences[key];
    setSaveError(null);
    setSaving(key);
    setOverride((prev) => ({ ...prev, [key]: next })); // otimista; reverte se o servidor recusar
    try {
      await usersService.updateNotificationPreferences({ [key]: next });
      setOverride({});
      refetch();
    } catch (err) {
      setOverride((prev) => {
        const { [key]: _discard, ...rest } = prev;
        return rest;
      });
      setSaveError(toErrorMessage(err, 'Não foi possível salvar a preferência. Tente novamente.'));
    } finally {
      setSaving(null);
    }
  }

  if (loading && !data) return <p className="text-xs text-slate-400 mt-3">Carregando preferências...</p>;
  if (error && !data) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-red-600" role="alert">
        <AlertCircle size={14} /> Não foi possível carregar as preferências.
        <button onClick={refetch} className="underline">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {saveError && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <AlertCircle size={14} /> {saveError}
        </div>
      )}
      {ITEMS.map((item) => {
        const checked = preferences?.[item.key] ?? false;
        return (
          <div key={item.key} className="flex items-center justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="text-sm font-medium text-slate-800">{item.label}</div>
              <div className="text-xs text-slate-400">{item.desc}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              aria-label={item.label}
              disabled={saving !== null}
              onClick={() => toggle(item.key)}
              className={`relative w-10 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
              style={{ height: '22px' }}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        );
      })}
      {saving && <p className="text-xs text-slate-400 mt-2">Salvando...</p>}
    </div>
  );
}
