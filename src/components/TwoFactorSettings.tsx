import { useState } from 'react';
import { AlertCircle, CheckCircle, Copy, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage, useApiQuery } from '../hooks/useApiQuery';
import { authService } from '../services/auth';
import QrCodeImage from './QrCodeImage';

type Step = { kind: 'idle' } | { kind: 'setup'; secret: string; otpauthUri: string } | { kind: 'codes'; codes: string[] } | { kind: 'disable' };

const inputClass = 'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white';

/**
 * Autenticação em dois fatores (TOTP) — ADMIN e LAWYER. Toda a validação é do backend: o frontend só
 * mostra o QR Code (gerado localmente a partir do URI) e nunca guarda o segredo depois do setup.
 */
export default function TwoFactorSettings() {
  const { user } = useAuth();
  const { data: status, loading, refetch } = useApiQuery(() => authService.twoFactorStatus(), [user?.id]);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading && !status) return <p className="text-xs text-slate-400">Carregando...</p>;
  if (!status) return null;

  const reset = () => {
    setStep({ kind: 'idle' });
    setCode('');
    setPassword('');
    setError(null);
  };

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const result = await authService.twoFactorSetup();
      setStep({ kind: 'setup', secret: result.secret, otpauthUri: result.otpauthUri });
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível iniciar a configuração.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    setError(null);
    try {
      const result = await authService.twoFactorVerifySetup(code.trim());
      setStep({ kind: 'codes', codes: result.backupCodes });
      setCode('');
      refetch();
    } catch (err) {
      setError(toErrorMessage(err, 'Código inválido. Confira o aplicativo e tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await authService.twoFactorDisable({ password, code: code.trim() });
      reset();
      refetch();
    } catch (err) {
      setError(toErrorMessage(err, 'Não foi possível desativar o 2FA.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
      <h3 className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
        <ShieldCheck size={14} /> Autenticação em dois fatores
      </h3>

      {!status.eligible ? (
        <p className="text-xs text-slate-400">Disponível apenas para administradores e advogados.</p>
      ) : !status.available ? (
        <p className="text-xs" style={{ color: '#B45309' }}>
          O 2FA está indisponível neste servidor (chave de criptografia não configurada). Fale com o administrador do sistema.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-3 max-w-lg">
            Adiciona um código temporário do seu aplicativo autenticador (Google Authenticator, Authy etc.) ao login.
          </p>

          {error && (
            <div role="alert" className="flex items-center gap-2 px-3 py-2 mb-3 text-xs rounded-lg max-w-md" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {step.kind === 'idle' && (
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="text-xs font-semibold px-2 py-1 rounded-full"
                style={status.enabled ? { backgroundColor: '#ECFDF5', color: '#047857' } : { backgroundColor: '#F1F5F9', color: '#475569' }}
              >
                {status.enabled ? 'Ativado' : 'Desativado'}
              </span>
              {status.enabled && <span className="text-xs text-slate-400">{status.backupCodesRemaining} códigos de recuperação restantes</span>}
              {status.enabled ? (
                <button onClick={() => { setError(null); setStep({ kind: 'disable' }); }} className="px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
                  Desativar 2FA
                </button>
              ) : (
                <button onClick={startSetup} disabled={busy} className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
                  {busy ? 'Gerando...' : 'Ativar 2FA'}
                </button>
              )}
            </div>
          )}

          {step.kind === 'setup' && (
            <div className="max-w-md space-y-3">
              <p className="text-xs text-slate-600">1. Escaneie o QR Code no aplicativo autenticador. 2. Digite o código de 6 dígitos para confirmar. O 2FA só é ativado depois da confirmação.</p>
              <QrCodeImage value={step.otpauthUri} alt="QR Code para configurar o autenticador" />
              <p className="text-xs text-slate-500">
                Sem câmera? Digite esta chave no aplicativo: <code className="font-mono select-all break-all">{step.secret}</code>
              </p>
              <input aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${inputClass} tracking-widest`} style={{ borderColor: 'var(--color-border)' }} />
              <div className="flex gap-2">
                <button onClick={confirmSetup} disabled={busy || code.length !== 6} className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
                  {busy ? 'Verificando...' : 'Confirmar e ativar'}
                </button>
                <button onClick={reset} className="px-3 py-1.5 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              </div>
            </div>
          )}

          {step.kind === 'codes' && (
            <div className="max-w-md space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#047857' }}><CheckCircle size={15} /> 2FA ativado.</div>
              <p className="text-xs text-slate-600">
                Guarde estes códigos de recuperação em local seguro. <strong>Eles são exibidos apenas esta vez</strong> e cada um funciona uma única vez, caso você perca o acesso ao aplicativo.
              </p>
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-50 font-mono text-sm">
                {step.codes.map((c) => <span key={c}>{c}</span>)}
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard?.writeText(step.codes.join('\n'))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}><Copy size={13} /> Copiar</button>
                <button onClick={reset} className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg" style={{ backgroundColor: 'var(--color-primary)' }}>Já guardei os códigos</button>
              </div>
            </div>
          )}

          {step.kind === 'disable' && (
            <div className="max-w-md space-y-3">
              <p className="text-xs text-slate-600">Para desativar, confirme sua senha atual e um código atual do aplicativo autenticador.</p>
              <input type="password" aria-label="Senha atual" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha atual" className={inputClass} style={{ borderColor: 'var(--color-border)' }} />
              <input aria-label="Código de 6 dígitos" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Código de 6 dígitos" className={inputClass} style={{ borderColor: 'var(--color-border)' }} />
              <div className="flex gap-2">
                <button onClick={disable} disabled={busy || !password || code.length !== 6} className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: '#DC2626' }}>{busy ? 'Desativando...' : 'Desativar 2FA'}</button>
                <button onClick={reset} className="px-3 py-1.5 text-sm font-medium border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
