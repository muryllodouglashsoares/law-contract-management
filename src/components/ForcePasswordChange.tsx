import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage } from '../hooks/useApiQuery';
import { usersService } from '../services/users';

const MIN_PASSWORD_LENGTH = 8; // mesma regra do backend (changePasswordBodySchema) e das Configurações

/**
 * Tela obrigatória de troca de senha (senha provisória). É renderizada pelo
 * ProtectedRoute no lugar de qualquer página interna enquanto
 * `user.mustChangePassword` for true — não há opção de adiar; só trocar ou sair.
 */
export default function ForcePasswordChange() {
  const { user, refresh, logout } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.next.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (form.next === form.current) {
      setError('A nova senha deve ser diferente da senha provisória.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }

    setSaving(true);
    try {
      await usersService.changePassword({ currentPassword: form.current, newPassword: form.next });
      // Recarrega o usuário: com mustChangePassword=false o ProtectedRoute libera o app.
      await refresh();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível alterar a senha.'));
      setSaving(false);
    }
  }

  const inputType = showPasswords ? 'text' : 'password';
  const inputClass = 'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2';

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-background)' }}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl border w-full max-w-md"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-primary)' }}>
            <KeyRound size={18} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
            Defina uma nova senha
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
            {user ? `Olá, ${user.name.split(' ')[0]}. ` : ''}Você entrou com uma senha provisória. Por segurança, é
            necessário criar uma senha pessoal antes de usar o sistema.
          </p>
        </div>

        <div className="px-6 pb-2 space-y-4">
          {error && (
            <div role="alert" className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
              <AlertCircle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}
          <div>
            <label htmlFor="fpc-current" className="block text-xs font-medium text-slate-700 mb-1.5">Senha provisória</label>
            <input
              id="fpc-current"
              type={inputType}
              autoComplete="current-password"
              required
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              className={inputClass}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </div>
          <div>
            <label htmlFor="fpc-next" className="block text-xs font-medium text-slate-700 mb-1.5">Nova senha</label>
            <input
              id="fpc-next"
              type={inputType}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              className={inputClass}
              style={{ borderColor: 'var(--color-border)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</p>
          </div>
          <div>
            <label htmlFor="fpc-confirm" className="block text-xs font-medium text-slate-700 mb-1.5">Repita a nova senha</label>
            <input
              id="fpc-confirm"
              type={inputType}
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              className={inputClass}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
          </button>
        </div>

        <div className="px-6 py-4 mt-2 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-red-600"
          >
            <LogOut size={14} /> Sair
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
