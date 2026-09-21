import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('muryllo@escritorio.com.br');
  const [password, setPassword] = useState('••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => navigate('/dashboard'), 1000);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 p-10 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
            <Scale size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>LexContract</span>
        </div>

        <div>
          <blockquote className="text-2xl font-semibold leading-snug mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            "Organização e clareza para a advocacia moderna."
          </blockquote>
          <p className="text-blue-200 text-sm leading-relaxed">
            Gerencie clientes, contratos, pagamentos e documentos em um único ambiente seguro e eficiente.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Contratos', value: '28' },
            { label: 'Clientes', value: '14' },
            { label: 'Este mês', value: 'R$ 42k' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/10 rounded-xl p-4">
              <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{stat.value}</div>
              <div className="text-xs text-blue-200 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }}>
              <Scale size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>LexContract</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Bem-vindo de volta</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--color-muted-foreground)' }}>Acesse seu escritório virtual</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)' }}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">Senha</label>
                <button type="button" className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
                  Esqueci a senha
                </button>
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)' }}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-blue-700"
              />
              <label htmlFor="remember" className="text-sm text-slate-600">Lembrar acesso</label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-70"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"/></svg>
                  Entrando...
                </span>
              ) : (
                <>Entrar <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-xs text-center" style={{ color: 'var(--color-muted-foreground)' }}>
            Ao acessar, você concorda com os{' '}
            <a href="#" className="underline" style={{ color: 'var(--color-accent)' }}>Termos de Uso</a>{' '}
            e a{' '}
            <a href="#" className="underline" style={{ color: 'var(--color-accent)' }}>Política de Privacidade</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
