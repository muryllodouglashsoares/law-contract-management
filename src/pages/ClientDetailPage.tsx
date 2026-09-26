import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, FileText, FolderOpen, CreditCard, Clock, Plus, AlertCircle } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { clientsService } from '../services/clients';
import { contractsService } from '../services/contracts';
import { documentsService } from '../services/documents';
import { paymentsService } from '../services/payments';
import { auditService } from '../services/audit';

const tabs = [
  { key: 'info', label: 'Informações', icon: Building2 },
  { key: 'contratos', label: 'Contratos', icon: FileText },
  { key: 'documentos', label: 'Documentos', icon: FolderOpen },
  { key: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
  { key: 'historico', label: 'Histórico', icon: Clock },
];

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState('info');

  const { data: clientData, loading: loadingClient, error: clientError } = useApiQuery(
    () => clientsService.getById(id!),
    [id],
  );
  const client = clientData?.client;

  const { data: contractsData } = useApiQuery(
    () => contractsService.list({ clientId: id, pageSize: 50 }),
    [id],
  );
  const { data: documentsData } = useApiQuery(
    () => documentsService.list({ clientId: id, pageSize: 50 }),
    [id],
  );
  const { data: paymentsData } = useApiQuery(
    () => paymentsService.list({ clientId: id, pageSize: 50 }),
    [id],
  );
  const { data: auditData } = useApiQuery(
    () => auditService.list({ entityType: 'Client', entityId: id, pageSize: 20 }),
    [id],
  );

  const clientContracts = contractsData?.data ?? [];
  const clientDocs = documentsData?.data ?? [];
  const clientPayments = paymentsData?.data ?? [];
  const clientHistory = auditData?.data ?? [];

  if (loadingClient) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (clientError || !client) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => navigate('/clientes')} className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>
          <ArrowLeft size={14} /> Clientes
        </button>
        <div className="flex items-center gap-2 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <AlertCircle size={15} /> {toErrorMessage(clientError, 'Cliente não encontrado.')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/clientes')}
        className="flex items-center gap-2 text-sm mb-4 hover:text-slate-900 transition-colors"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <ArrowLeft size={14} /> Clientes
      </button>

      {/* Client header */}
      <div className="bg-white rounded-xl border p-6 mb-5 flex items-start gap-5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
          {client.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{client.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <StatusBadge status={client.status} />
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{client.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/contratos/novo')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus size={14} /> Novo contrato
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 flex-wrap text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><Mail size={13} />{client.email}</span>
            {client.phone && <span className="flex items-center gap-1.5"><Phone size={13} />{client.phone}</span>}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Contratos', value: client.contractsCount, color: 'var(--color-primary)', bg: '#EFF6FF' },
          { label: 'Documentos', value: clientDocs.length, color: '#D97706', bg: '#FFFBEB' },
          { label: 'Pagamentos', value: clientPayments.length, color: '#059669', bg: '#F0FDF4' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border p-4 text-center" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-2xl font-bold" style={{ color: stat.color, fontFamily: 'var(--font-display)' }}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex border-b overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Dados pessoais</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Nome', value: client.name },
                    { label: 'CPF / CNPJ', value: client.document },
                    { label: 'E-mail', value: client.email },
                    { label: 'Telefone', value: client.phone ?? '—' },
                    { label: 'Endereço', value: client.address ?? '—' },
                    { label: 'Última atividade', value: new Date(client.lastActivity).toLocaleDateString('pt-BR') },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="text-xs text-slate-400 mb-0.5">{f.label}</div>
                      <div className="text-sm font-medium text-slate-800">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Observações</h3>
                <div className="p-3 rounded-lg text-sm text-slate-500 italic" style={{ backgroundColor: '#FAFAFA', border: '1px solid var(--color-border)' }}>
                  {client.notes || 'Nenhuma observação registrada.'}
                </div>
              </div>
            </div>
          )}

          {tab === 'contratos' && (
            <div className="space-y-2">
              {clientContracts.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FileText size={28} className="mx-auto mb-2" />
                  <p className="text-sm">Nenhum contrato</p>
                </div>
              ) : clientContracts.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-4 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer transition-colors"
                  style={{ borderColor: 'var(--color-border)' }}
                  onClick={() => navigate(`/contratos/${c.id}`)}
                >
                  <div className="text-xs font-mono font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600">#{c.number}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{c.template.name}</div>
                    <div className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <StatusBadge status={c.status} size="sm" />
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-foreground)' }}>
                    {c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'documentos' && (
            <div className="space-y-2">
              {clientDocs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FolderOpen size={28} className="mx-auto mb-2" />
                  <p className="text-sm">Nenhum documento</p>
                </div>
              ) : clientDocs.map(d => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 cursor-pointer transition-colors"
                  style={{ borderColor: 'var(--color-border)' }}
                  onClick={() => documentsService.download(d.id, d.fileName)}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#EFF6FF', color: 'var(--color-primary)' }}>
                    {d.fileType}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{d.fileName}</div>
                    <div className="text-xs text-slate-400">
                      {(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{d.category}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'pagamentos' && (
            <div className="space-y-2">
              {clientPayments.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CreditCard size={28} className="mx-auto mb-2" />
                  <p className="text-sm">Nenhum pagamento</p>
                </div>
              ) : clientPayments.map(p => (
                <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">Contrato #{p.contract.number} · Parcela {p.installmentNumber}/{p.installmentTotal}</div>
                    <div className="text-xs text-slate-400">Venc. {new Date(p.dueDate).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <StatusBadge status={p.status} size="sm" />
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    {p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'historico' && (
            <div className="relative pl-6">
              {clientHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Clock size={28} className="mx-auto mb-2" />
                  <p className="text-sm">Nenhum evento registrado para este cliente</p>
                </div>
              ) : (
                <>
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                  {clientHistory.map((item) => {
                    const date = new Date(item.createdAt);
                    return (
                      <div key={item.id} className="relative mb-5">
                        <div className="absolute -left-4 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: 'var(--color-primary)' }} />
                        <div className="text-xs mb-0.5 tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                          {date.toLocaleDateString('pt-BR')} · {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm text-slate-700">{item.actorName} {item.action} {item.entityLabel}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
