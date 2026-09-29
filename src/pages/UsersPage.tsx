import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Copy, Plus, Search, ShieldCheck, Users } from 'lucide-react';

import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { toErrorMessage, useApiQuery } from '../hooks/useApiQuery';
import { ROLE_LABELS, ROLE_OPTIONS } from '../lib/roles';
import { usersService, type CreatedUser } from '../services/users';
import type { User, UserRole } from '../types/api';

const PAGE_SIZE = 20;

const inputClass = 'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2';
const thClass = 'px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500';

/**
 * Gestão de usuários do escritório. O acesso por papel aqui é só conveniência de UX
 * (a rota e o menu escondem a página); a autorização real é feita pelo backend,
 * que restringe todas as rotas de gestão a ADMIN e ao escritório da sessão.
 */
export default function UsersPage() {
  const { user } = useAuth();

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return <UsersAdmin currentUserId={user.id} />;
}

interface ModalProps {
  title: string;
  description?: string;
  onClose?: () => void;
  children: ReactNode;
}

/** Modal simples no mesmo visual dos existentes. Sem `onClose`, só fecha pelas ações do conteúdo. */
function Modal({ title, description, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
          {description && <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
      <AlertCircle size={15} className="flex-shrink-0" /> {message}
    </div>
  );
}

function CancelButton({ onClick, label = 'Cancelar' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {label}
    </button>
  );
}

function PrimaryButton({ children, disabled, danger }: { children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
      style={{ backgroundColor: danger ? 'var(--color-error)' : 'var(--color-primary)' }}
    >
      {children}
    </button>
  );
}

interface NewUserForm {
  name: string;
  email: string;
  phone: string;
  oabNumber: string;
  role: UserRole;
}

const EMPTY_FORM: NewUserForm = { name: '', email: '', phone: '', oabNumber: '', role: 'LAWYER' };

function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [nextRole, setNextRole] = useState<UserRole>('LAWYER');
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, loading, error, refetch } = useApiQuery(
    () => usersService.list({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    [page, debouncedSearch],
  );

  const users = data?.data ?? [];
  const pagination = data?.pagination;

  function closeCreate() {
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setModalError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setSubmitting(true);
    try {
      const result = await usersService.create({
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || undefined,
        oabNumber: form.oabNumber || undefined,
      });
      // A senha provisória fica somente neste estado (memória): nada de storage, URL ou console.
      setCreated(result);
      setCopyState('idle');
      closeCreate();
      refetch();
    } catch (err) {
      setModalError(toErrorMessage(err, 'Não foi possível criar o usuário.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  function openRoleModal(target: User) {
    setRoleTarget(target);
    setNextRole(target.role);
    setModalError(null);
  }

  async function handleChangeRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleTarget) return;
    setModalError(null);
    setSubmitting(true);
    try {
      await usersService.updateRole(roleTarget.id, nextRole);
      setNotice(`Papel de ${roleTarget.name} alterado para ${ROLE_LABELS[nextRole]}.`);
      setPageError(null);
      setRoleTarget(null);
      refetch();
    } catch (err) {
      setModalError(toErrorMessage(err, 'Não foi possível alterar o papel.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(e: React.FormEvent) {
    e.preventDefault();
    if (!deactivateTarget) return;
    setModalError(null);
    setSubmitting(true);
    try {
      await usersService.updateStatus(deactivateTarget.id, 'INACTIVE');
      setNotice(`${deactivateTarget.name} foi desativado(a).`);
      setPageError(null);
      setDeactivateTarget(null);
      refetch();
    } catch (err) {
      // Ex.: último administrador ativo — mostra a mensagem real da API.
      setModalError(toErrorMessage(err, 'Não foi possível desativar o usuário.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivate(target: User) {
    setBusyUserId(target.id);
    setPageError(null);
    setNotice(null);
    try {
      await usersService.updateStatus(target.id, 'ACTIVE');
      setNotice(`${target.name} foi ativado(a).`);
      refetch();
    } catch (err) {
      setPageError(toErrorMessage(err, 'Não foi possível ativar o usuário.'));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Usuários</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Gerencie os membros do escritório e suas permissões.
          </p>
        </div>
        <button
          onClick={() => { setCreateOpen(true); setNotice(null); setModalError(null); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Adicionar usuário
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar usuários"
          placeholder="Buscar por nome ou e-mail..."
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
          style={{ borderColor: 'var(--color-border)' }}
        />
      </div>

      {notice && (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#F0FDF4', color: '#059669' }}>
          <span className="flex items-center gap-2"><CheckCircle size={15} />{notice}</span>
          <button onClick={() => setNotice(null)} className="font-semibold underline flex-shrink-0">Fechar</button>
        </div>
      )}

      {pageError && <div className="mb-4"><ErrorBanner message={pageError} /></div>}

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{error}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
                <th className={thClass}>Nome</th>
                <th className={`${thClass} hidden md:table-cell`}>E-mail</th>
                <th className={thClass}>Papel</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center">
                  <div className="w-6 h-6 mx-auto rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                </td></tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Users size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">Nenhum usuário encontrado</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Tente outros termos de busca ou adicione um novo usuário</p>
                  </td>
                </tr>
              ) : users.map((u) => {
                const isSelf = u.id === currentUserId;
                const active = u.status === 'ACTIVE';
                return (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">
                            {u.name}
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(você)</span>}
                          </div>
                          <div className="text-xs text-slate-500 truncate md:hidden">{u.email}</div>
                          {u.mustChangePassword && (
                            <div className="text-xs mt-0.5" style={{ color: 'var(--color-warning)' }}>Aguardando troca da senha provisória</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-slate-600">{u.email}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-sm text-slate-700">
                        {u.role === 'ADMIN' && <ShieldCheck size={13} style={{ color: 'var(--color-primary)' }} />}
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={active ? 'ativo' : 'inativo'} size="sm" />
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => openRoleModal(u)}
                        disabled={isSelf}
                        title={isSelf ? 'Você não pode alterar o seu próprio papel' : undefined}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        Alterar papel
                      </button>
                      {active ? (
                        <button
                          onClick={() => { setDeactivateTarget(u); setModalError(null); }}
                          disabled={isSelf}
                          title={isSelf ? 'Você não pode desativar a si mesmo' : undefined}
                          className="ml-2 px-2.5 py-1 text-xs font-medium rounded-md border bg-white hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-error)' }}
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleActivate(u)}
                          disabled={busyUserId === u.id}
                          className="ml-2 px-2.5 py-1 text-xs font-medium rounded-md border bg-white hover:bg-green-50 disabled:opacity-60"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-success)' }}
                        >
                          {busyUserId === u.id ? 'Ativando...' : 'Ativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t flex-wrap" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Exibindo {users.length} de {pagination.total} usuários
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 text-xs border rounded bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>
                {pagination.page}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 text-xs border rounded bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Adicionar usuário */}
      {createOpen && (
        <Modal title="Adicionar usuário" description="Uma senha provisória será gerada para o primeiro acesso." onClose={closeCreate}>
          <form onSubmit={handleCreate}>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {modalError && <ErrorBanner message={modalError} />}
              <div>
                <label htmlFor="nu-name" className="block text-xs font-medium text-slate-700 mb-1.5">Nome *</label>
                <input id="nu-name" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} style={{ borderColor: 'var(--color-border)' }} placeholder="Maria Silva" />
              </div>
              <div>
                <label htmlFor="nu-email" className="block text-xs font-medium text-slate-700 mb-1.5">E-mail *</label>
                <input id="nu-email" required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputClass} style={{ borderColor: 'var(--color-border)' }} placeholder="maria@escritorio.com" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="nu-phone" className="block text-xs font-medium text-slate-700 mb-1.5">Telefone</label>
                  <input id="nu-phone" maxLength={30} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} style={{ borderColor: 'var(--color-border)' }} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label htmlFor="nu-oab" className="block text-xs font-medium text-slate-700 mb-1.5">OAB</label>
                  <input id="nu-oab" maxLength={40} value={form.oabNumber} onChange={(e) => setForm((f) => ({ ...f, oabNumber: e.target.value }))} className={inputClass} style={{ borderColor: 'var(--color-border)' }} placeholder="OAB/SP 123456" />
                </div>
              </div>
              <div>
                <label htmlFor="nu-role" className="block text-xs font-medium text-slate-700 mb-1.5">Papel *</label>
                <select id="nu-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))} className={`${inputClass} bg-white`} style={{ borderColor: 'var(--color-border)' }}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <CancelButton onClick={closeCreate} />
              <PrimaryButton disabled={submitting}>{submitting ? 'Criando...' : 'Criar usuário'}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {/* Senha provisória (exibida uma única vez) */}
      {created && (
        <Modal title="Usuário criado" description={`${created.user.name} (${created.user.email})`}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="tmp-password" className="block text-xs font-medium text-slate-700 mb-1.5">Senha provisória</label>
              <div className="flex gap-2">
                <input
                  id="tmp-password"
                  readOnly
                  value={created.temporaryPassword}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border rounded-lg bg-slate-50 focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-mono)' }}
                />
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-700"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <Copy size={14} /> Copiar
                </button>
              </div>
              {copyState === 'copied' && (
                <p role="status" className="flex items-center gap-1.5 text-xs mt-2" style={{ color: 'var(--color-success)' }}><CheckCircle size={13} /> Senha copiada.</p>
              )}
              {copyState === 'failed' && (
                <p role="status" className="text-xs mt-2" style={{ color: 'var(--color-error)' }}>Não foi possível copiar automaticamente. Selecione o texto acima e copie manualmente.</p>
              )}
            </div>
            <div className="flex items-start gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FFFBEB', color: '#B45309' }}>
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>Esta senha será exibida somente agora. Copie e entregue ao usuário. Ela não poderá ser recuperada posteriormente.</span>
            </div>
          </div>
          <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              onClick={() => { setCreated(null); setCopyState('idle'); }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Concluir
            </button>
          </div>
        </Modal>
      )}

      {/* Alterar papel */}
      {roleTarget && (
        <Modal title="Alterar papel" description={`${roleTarget.name} · ${roleTarget.email}`} onClose={() => setRoleTarget(null)}>
          <form onSubmit={handleChangeRole}>
            <div className="px-6 py-5 space-y-3">
              {modalError && <ErrorBanner message={modalError} />}
              <div role="radiogroup" aria-label="Papel" className="space-y-2">
                {ROLE_OPTIONS.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer hover:bg-slate-50"
                    style={{ borderColor: nextRole === r ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <input type="radio" name="role" value={r} checked={nextRole === r} onChange={() => setNextRole(r)} />
                    <span className="text-sm text-slate-800">{ROLE_LABELS[r]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <CancelButton onClick={() => setRoleTarget(null)} />
              <PrimaryButton disabled={submitting || nextRole === roleTarget.role}>{submitting ? 'Salvando...' : 'Salvar papel'}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {/* Desativar */}
      {deactivateTarget && (
        <Modal title="Desativar usuário" onClose={() => setDeactivateTarget(null)}>
          <form onSubmit={handleDeactivate}>
            <div className="px-6 py-5 space-y-3">
              {modalError && <ErrorBanner message={modalError} />}
              <p className="text-sm text-slate-700">
                Tem certeza que deseja desativar <strong>{deactivateTarget.name}</strong>? Ele não poderá mais acessar o sistema.
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                O histórico de contratos e ações é preservado, e o usuário pode ser reativado depois.
              </p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <CancelButton onClick={() => setDeactivateTarget(null)} />
              <PrimaryButton danger disabled={submitting}>{submitting ? 'Desativando...' : 'Desativar'}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
