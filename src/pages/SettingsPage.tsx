import { useEffect, useState } from 'react';
import { User, Building2, Shield, Sliders, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage } from '../hooks/useApiQuery';
import { usersService } from '../services/users';
import { officesService } from '../services/offices';

const tabs = [
  { key: 'perfil', label: 'Perfil', icon: User },
  { key: 'escritorio', label: 'Escritório', icon: Building2 },
  { key: 'seguranca', label: 'Segurança', icon: Shield },
  { key: 'preferencias', label: 'Preferências', icon: Sliders },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '')).toUpperCase();
}

export default function SettingsPage() {
  const { user, office, refresh } = useAuth();
  const [tab, setTab] = useState('perfil');
  const [notifications, setNotifications] = useState({ email: true, browser: true, whatsapp: false });

  // --- Perfil -----------------------------------------------------------
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', oabNumber: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) setProfileForm({ name: user.name, phone: user.phone ?? '', oabNumber: user.oabNumber ?? '' });
  }, [user]);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await usersService.updateMe({
        name: profileForm.name,
        phone: profileForm.phone || undefined,
        oabNumber: profileForm.oabNumber || undefined,
      });
      await refresh();
      setProfileMessage({ type: 'success', text: 'Perfil atualizado com sucesso.' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível salvar o perfil.') });
    } finally {
      setProfileSaving(false);
    }
  }

  // --- Escritório ---------------------------------------------------------
  const [officeForm, setOfficeForm] = useState({ name: '', phone: '', address: '', specialties: '' });
  const [officeSaving, setOfficeSaving] = useState(false);
  const [officeMessage, setOfficeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const canEditOffice = user?.role === 'ADMIN';

  useEffect(() => {
    if (office) setOfficeForm({ name: office.name, phone: office.phone ?? '', address: office.address ?? '', specialties: office.specialties ?? '' });
  }, [office]);

  async function saveOffice() {
    setOfficeSaving(true);
    setOfficeMessage(null);
    try {
      await officesService.updateMe({
        name: officeForm.name,
        phone: officeForm.phone || undefined,
        address: officeForm.address || undefined,
        specialties: officeForm.specialties || undefined,
      });
      await refresh();
      setOfficeMessage({ type: 'success', text: 'Dados do escritório atualizados.' });
    } catch (err) {
      setOfficeMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível salvar os dados do escritório.') });
    } finally {
      setOfficeSaving(false);
    }
  }

  // --- Segurança ----------------------------------------------------------
  const [showPass, setShowPass] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function savePassword() {
    setPasswordMessage(null);
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordMessage({ type: 'error', text: 'A confirmação não corresponde à nova senha.' });
      return;
    }
    setPasswordSaving(true);
    try {
      await usersService.changePassword({ currentPassword: passwordForm.current, newPassword: passwordForm.next });
      setPasswordForm({ current: '', next: '', confirm: '' });
      setPasswordMessage({ type: 'success', text: 'Senha alterada com sucesso.' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível alterar a senha.') });
    } finally {
      setPasswordSaving(false);
    }
  }

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
                <div className="flex items-center gap-4 mb-6 pb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                    {user ? initialsOf(user.name) : ''}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{user?.name}</div>
                    <div className="text-xs text-slate-400">{user?.email}</div>
                  </div>
                </div>
                {profileMessage && (
                  <div className="flex items-center gap-2 px-3 py-2.5 mb-4 text-sm rounded-lg" style={{
                    backgroundColor: profileMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                    color: profileMessage.type === 'success' ? '#059669' : '#DC2626',
                  }}>
                    {profileMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {profileMessage.text}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome completo</label>
                    <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">E-mail profissional</label>
                    <input value={user?.email ?? ''} disabled className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-400" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Telefone</label>
                    <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">OAB</label>
                    <input value={profileForm.oabNumber} onChange={e => setProfileForm(f => ({ ...f, oabNumber: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                </div>
              </div>
            )}

            {tab === 'escritorio' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Dados do escritório</h2>
                {!canEditOffice && (
                  <div className="flex items-center gap-2 px-3 py-2.5 mb-4 text-sm rounded-lg" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
                    <AlertCircle size={15} /> Apenas administradores podem editar os dados do escritório.
                  </div>
                )}
                {officeMessage && (
                  <div className="flex items-center gap-2 px-3 py-2.5 mb-4 text-sm rounded-lg" style={{
                    backgroundColor: officeMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                    color: officeMessage.type === 'success' ? '#059669' : '#DC2626',
                  }}>
                    {officeMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {officeMessage.text}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome do escritório</label>
                    <input disabled={!canEditOffice} value={officeForm.name} onChange={e => setOfficeForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white disabled:bg-slate-50 disabled:text-slate-400" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">CNPJ</label>
                    <input disabled value={office?.document ?? ''} className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-400" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Telefone comercial</label>
                    <input disabled={!canEditOffice} value={officeForm.phone} onChange={e => setOfficeForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white disabled:bg-slate-50 disabled:text-slate-400" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Endereço completo</label>
                    <textarea disabled={!canEditOffice} rows={2} value={officeForm.address} onChange={e => setOfficeForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none bg-white disabled:bg-slate-50 disabled:text-slate-400" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Especialidades</label>
                    <input disabled={!canEditOffice} value={officeForm.specialties} onChange={e => setOfficeForm(f => ({ ...f, specialties: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white disabled:bg-slate-50 disabled:text-slate-400" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                </div>
              </div>
            )}

            {tab === 'seguranca' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Segurança da conta</h2>
                {passwordMessage && (
                  <div className="flex items-center gap-2 px-3 py-2.5 mb-4 text-sm rounded-lg" style={{
                    backgroundColor: passwordMessage.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                    color: passwordMessage.type === 'success' ? '#059669' : '#DC2626',
                  }}>
                    {passwordMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {passwordMessage.text}
                  </div>
                )}
                <h3 className="text-xs font-semibold text-slate-700 mb-4">Alterar senha</h3>
                <div className="space-y-3 max-w-md">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Senha atual</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={passwordForm.current}
                        onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                        className="w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2"
                        style={{ borderColor: 'var(--color-border)' }}
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPass(!showPass)}>
                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Nova senha</label>
                    <input type="password" value={passwordForm.next} onChange={e => setPasswordForm(f => ({ ...f, next: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Confirmar nova senha</label>
                    <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
                  </div>
                  <button
                    onClick={savePassword}
                    disabled={passwordSaving || !passwordForm.current || passwordForm.next.length < 8}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {passwordSaving ? 'Salvando...' : 'Alterar senha'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'preferencias' && (
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Preferências</h2>
                <div className="space-y-5">
                  <div className="pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="text-xs font-semibold text-slate-700 mb-1">Notificações</h3>
                    <p className="text-xs text-slate-400 mb-3">Estas preferências ainda não são salvas no servidor — válidas apenas nesta sessão.</p>
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
                          className={`relative w-10 rounded-full transition-colors ${notifications[n.key as keyof typeof notifications] ? 'bg-blue-600' : 'bg-slate-200'}`}
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

          {(tab === 'perfil' || tab === 'escritorio') && (
            <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
              <button
                onClick={tab === 'perfil' ? saveProfile : saveOffice}
                disabled={tab === 'perfil' ? profileSaving : (officeSaving || !canEditOffice)}
                className="px-5 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {(tab === 'perfil' ? profileSaving : officeSaving) ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
