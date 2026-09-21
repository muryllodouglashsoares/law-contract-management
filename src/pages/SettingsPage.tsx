import { useState } from 'react';
import { User, Building2, Shield, Sliders, Camera, Eye, EyeOff } from 'lucide-react';

const tabs = [
  { key: 'perfil', label: 'Perfil', icon: User },
  { key: 'escritorio', label: 'Escritório', icon: Building2 },
  { key: 'seguranca', label: 'Segurança', icon: Shield },
  { key: 'preferencias', label: 'Preferências', icon: Sliders },
];

function Field({ label, defaultValue, type = 'text', placeholder }: { label: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1.5">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white"
        style={{ borderColor: 'var(--color-border)' }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('perfil');
  const [showPass, setShowPass] = useState(false);
  const [notifications, setNotifications] = useState({ email: true, browser: true, whatsapp: false });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Configurações</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Gerencie sua conta e preferências</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-44 flex-shrink-0">
          <nav className="space-y-0.5">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  tab === t.key ? 'text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                style={tab === t.key ? { backgroundColor: 'var(--color-primary)' } : {}}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="p-6">
            {tab === 'perfil' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Informações pessoais</h2>
                {/* Avatar */}
                <div className="flex items-center gap-4 mb-6 pb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                      MR
                    </div>
                    <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border flex items-center justify-center shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                      <Camera size={11} className="text-slate-600" />
                    </button>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Muryllo Rocha</div>
                    <div className="text-xs text-slate-400">JPG ou PNG · Máx. 2MB</div>
                    <button className="text-xs mt-1 font-medium" style={{ color: 'var(--color-accent)' }}>Alterar foto</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nome completo" defaultValue="Muryllo Rocha" />
                  <Field label="E-mail profissional" defaultValue="muryllo@escritorio.com.br" type="email" />
                  <Field label="Telefone" defaultValue="(11) 98765-4321" />
                  <Field label="OAB" defaultValue="OAB/SP 123.456" />
                </div>
              </div>
            )}

            {tab === 'escritorio' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Dados do escritório</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Field label="Nome do escritório" defaultValue="Rocha Advocacia & Consultoria Jurídica" />
                  </div>
                  <Field label="CNPJ" defaultValue="12.345.678/0001-90" />
                  <Field label="Telefone comercial" defaultValue="(11) 3456-7890" />
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Endereço completo</label>
                    <textarea rows={2} defaultValue="Av. Paulista, 1000, cj. 501 · Bela Vista · São Paulo — SP · 01310-100" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Especialidades</label>
                    <input defaultValue="Direito Civil, Contratos, Trabalhista" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                </div>
              </div>
            )}

            {tab === 'seguranca' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Segurança da conta</h2>
                <div className="space-y-5">
                  <div className="pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="text-xs font-semibold text-slate-700 mb-4">Alterar senha</h3>
                    <div className="space-y-3 max-w-md">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Senha atual</label>
                        <div className="relative">
                          <input type={showPass ? 'text' : 'password'} className="w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
                          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPass(!showPass)}>
                            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                      <Field label="Nova senha" type="password" />
                      <Field label="Confirmar nova senha" type="password" />
                    </div>
                  </div>
                  <div className="pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="text-xs font-semibold text-slate-700 mb-4">Sessões ativas</h3>
                    {[
                      { device: 'MacBook Pro · Chrome', location: 'São Paulo, BR', current: true, time: 'Agora' },
                      { device: 'iPhone 15 · Safari', location: 'São Paulo, BR', current: false, time: 'Há 2h' },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-3 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{s.device}</div>
                          <div className="text-xs text-slate-400">{s.location} · {s.time}</div>
                        </div>
                        {s.current ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F0FDF4', color: '#059669' }}>Sessão atual</span>
                        ) : (
                          <button className="text-xs font-medium text-red-500 hover:text-red-700">Encerrar</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'preferencias' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Preferências</h2>
                <div className="space-y-5">
                  <div className="pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="text-xs font-semibold text-slate-700 mb-4">Notificações</h3>
                    {[
                      { key: 'email', label: 'E-mail', desc: 'Receber alertas por e-mail' },
                      { key: 'browser', label: 'Navegador', desc: 'Notificações push no navegador' },
                      { key: 'whatsapp', label: 'WhatsApp', desc: 'Alertas via WhatsApp' },
                    ].map(n => (
                      <div key={n.key} className="flex items-center justify-between py-3 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{n.label}</div>
                          <div className="text-xs text-slate-400">{n.desc}</div>
                        </div>
                        <button
                          onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key as keyof typeof prev] }))}
                          className={`relative w-10 h-5.5 rounded-full transition-colors ${notifications[n.key as keyof typeof notifications] ? 'bg-blue-600' : 'bg-slate-200'}`}
                          style={{ height: '22px' }}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${notifications[n.key as keyof typeof notifications] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 mb-4">Idioma e fuso horário</h3>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Idioma</label>
                        <select className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }}>
                          <option>Português (BR)</option>
                          <option>English</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Fuso horário</label>
                        <select className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }}>
                          <option>América/São Paulo</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <button
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Salvar alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
