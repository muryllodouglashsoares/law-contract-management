import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Building2, FileText, FolderOpen, CreditCard, Clock, Plus } from 'lucide-react';
import { clients, contracts, payments, documents } from '../data/mock';
import StatusBadge from '../components/StatusBadge';

const tabs = [
  { key: 'info', label: 'Informações', icon: Building2 },
  { key: 'contratos', label: 'Contratos', icon: FileText },
  { key: 'documentos', label: 'Documentos', icon: FolderOpen },
  { key: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
  { key: 'historico', label: 'Histórico', icon: Clock },
];

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('info');

  const client = clients.find(c => c.id === Number(id)) ?? clients[0];
  const clientContracts = contracts.filter(c => c.clientId === client.id);
  const clientPayments = payments.filter(p => p.client === client.name);
  const clientDocs = documents.filter(d => d.client === client.name);

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
            <span className="flex items-center gap-1.5"><Phone size={13} />{client.phone}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Contratos', value: client.contracts, color: 'var(--color-primary)', bg: '#EFF6FF' },
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
                    { label: 'Telefone', value: client.phone },
                    { label: 'Última atividade', value: client.lastActivity },
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
                  Nenhuma observação registrada.
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
                  <div className="text-xs font-mono font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600">#{c.id}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{c.template}</div>
                    <div className="text-xs text-slate-400">{c.createdAt}</div>
                  </div>
                  <StatusBadge status={c.status} size="sm" />
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-foreground)' }}>
                    R$ {c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#EFF6FF', color: 'var(--color-primary)' }}>
                    {d.type}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{d.name}</div>
                    <div className="text-xs text-slate-400">{d.size} · {d.date}</div>
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
                    <div className="text-sm font-medium text-slate-800">Contrato #{p.contractId} · Parcela {p.installment}</div>
                    <div className="text-xs text-slate-400">Venc. {p.dueDate}</div>
                  </div>
                  <StatusBadge status={p.status} size="sm" />
                  <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    R$ {p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'historico' && (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
              {[
                { date: '21/09/2026', time: '14:32', text: 'Contrato #102 criado para este cliente' },
                { date: '19/09/2026', time: '10:00', text: 'Cliente cadastrado no sistema' },
              ].map((item, i) => (
                <div key={i} className="relative mb-5">
                  <div className="absolute -left-4 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: 'var(--color-primary)' }} />
                  <div className="text-xs mb-0.5 tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    {item.date} · {item.time}
                  </div>
                  <div className="text-sm text-slate-700">{item.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
