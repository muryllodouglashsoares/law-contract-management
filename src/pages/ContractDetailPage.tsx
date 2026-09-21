import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Download, FileText, Check, Eye, Edit2, CreditCard } from 'lucide-react';
import { contracts, payments } from '../data/mock';
import StatusBadge from '../components/StatusBadge';

const timeline = [
  { status: 'Criado', date: '01/09/2026 14:32', done: true },
  { status: 'Enviado', date: '01/09/2026 15:05', done: true },
  { status: 'Visualizado', date: '02/09/2026 09:12', done: true },
  { status: 'Assinado', date: '02/09/2026 10:02', done: true },
  { status: 'Ativo', date: '03/09/2026', done: true },
];

export default function ContractDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('resumo');

  const contract = contracts.find(c => c.id === Number(id)) ?? contracts[0];
  const contractPayments = payments.filter(p => p.contractId === contract.id);
  const totalPaid = contractPayments.filter(p => p.status === 'pago').reduce((s, p) => s + p.value, 0);
  const totalPending = contractPayments.filter(p => p.status !== 'pago').reduce((s, p) => s + p.value, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/contratos')} className="flex items-center gap-2 text-sm mb-4 hover:text-slate-900" style={{ color: 'var(--color-muted-foreground)' }}>
        <ArrowLeft size={14} /> Contratos
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border p-6 mb-5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">#{contract.id}</span>
              <StatusBadge status={contract.status} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-2" style={{ fontFamily: 'var(--font-display)' }}>{contract.template}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
              Cliente: <span className="font-medium text-slate-700 cursor-pointer hover:underline" onClick={() => navigate(`/clientes/${contract.clientId}`)}>{contract.client}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 transition-colors text-slate-600" style={{ borderColor: 'var(--color-border)' }}>
              <Eye size={14} /> Visualizar PDF
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 transition-colors text-slate-600" style={{ borderColor: 'var(--color-border)' }}>
              <Download size={14} /> Baixar PDF
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90" style={{ backgroundColor: 'var(--color-primary)' }}>
              <Send size={14} /> Enviar
            </button>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {[
            { label: 'Valor', value: `R$ ${contract.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'Início', value: contract.createdAt },
            { label: 'Última atualização', value: contract.updatedAt },
            { label: 'Responsável', value: 'Muryllo Rocha' },
          ].map(m => (
            <div key={m.label}>
              <div className="text-xs text-slate-400 mb-0.5">{m.label}</div>
              <div className="text-sm font-semibold text-slate-800 tabular-nums" style={{ fontFamily: m.label === 'Valor' ? 'var(--font-mono)' : undefined }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex border-b overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
          {[
            { key: 'resumo', label: 'Resumo' },
            { key: 'documento', label: 'Documento' },
            { key: 'status', label: 'Status' },
            { key: 'pagamentos', label: 'Pagamentos' },
            { key: 'historico', label: 'Histórico' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'resumo' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Dados do contrato</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Número', value: `#${contract.id}` },
                    { label: 'Modelo', value: contract.template },
                    { label: 'Cliente', value: contract.client },
                    { label: 'Valor total', value: `R$ ${contract.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                    { label: 'Status', value: <StatusBadge status={contract.status} size="sm" /> },
                    { label: 'Responsável', value: 'Muryllo Rocha · OAB/SP 123.456' },
                  ].map(f => (
                    <div key={f.label} className="flex items-start justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                      <span className="text-xs text-slate-400 flex-shrink-0 w-32">{f.label}</span>
                      <span className="text-sm font-medium text-slate-800 text-right">{typeof f.value === 'string' ? f.value : f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Ações rápidas</h3>
                <div className="space-y-2">
                  {[
                    { icon: Send, label: 'Enviar para assinatura', color: 'var(--color-primary)' },
                    { icon: Download, label: 'Baixar PDF', color: '#475569' },
                    { icon: Edit2, label: 'Editar contrato', color: '#475569' },
                    { icon: CreditCard, label: 'Registrar pagamento', color: '#059669' },
                  ].map(action => (
                    <button
                      key={action.label}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <action.icon size={15} style={{ color: action.color }} />
                      <span className="text-sm font-medium text-slate-700">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documento' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Documento do contrato</h3>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>
                    <Download size={12} /> Baixar PDF
                  </button>
                </div>
              </div>
              <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
                <FileText size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">Visualização do PDF</p>
                <p className="text-xs mt-1 text-slate-400">O documento apareceria aqui em modo de preview</p>
                <div className="mt-4 rounded-lg border p-6 bg-white text-left max-w-lg mx-auto" style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.9', color: '#374151' }}>
                  <div className="text-center font-semibold mb-4">CONTRATO DE PRESTAÇÃO DE SERVIÇOS JURÍDICOS</div>
                  <div>CONTRATANTE: <span className="text-blue-700">João da Silva</span></div>
                  <div>CPF: <span className="text-blue-700">123.456.789-00</span></div>
                  <div className="mt-2">VALOR: <span className="text-blue-700">R$ 4.800,00</span></div>
                  <div>DATA DE INÍCIO: <span className="text-blue-700">01/09/2026</span></div>
                  <div className="mt-2 text-slate-400">[...restante do contrato...]</div>
                  <div className="mt-6 pt-4 border-t flex justify-between" style={{ borderColor: '#E2E8F0' }}>
                    <div className="text-center">
                      <div className="w-20 border-b border-slate-400 mb-1" />
                      <div className="text-xs text-slate-400">Contratante</div>
                    </div>
                    <div className="text-center">
                      <div className="w-20 border-b border-slate-400 mb-1" />
                      <div className="text-xs text-slate-400">Advogado</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-6">Timeline do contrato</h3>
              <div className="relative pl-8">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
                {timeline.map((item, i) => (
                  <div key={i} className="relative mb-6">
                    <div className={`absolute -left-5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${item.done ? 'bg-green-500' : 'bg-slate-200'}`}>
                      {item.done && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${item.done ? 'text-slate-900' : 'text-slate-400'}`}>{item.status}</span>
                      <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{item.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pagamentos' && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="text-center p-4 rounded-xl" style={{ backgroundColor: '#F0FDF4' }}>
                  <div className="text-lg font-bold text-green-700 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>R$ {totalPaid.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
                  <div className="text-xs text-green-600 mt-0.5">Pago</div>
                </div>
                <div className="text-center p-4 rounded-xl" style={{ backgroundColor: '#FFFBEB' }}>
                  <div className="text-lg font-bold text-amber-700 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>R$ {totalPending.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
                  <div className="text-xs text-amber-600 mt-0.5">Pendente</div>
                </div>
                <div className="text-center p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF' }}>
                  <div className="text-lg font-bold text-blue-700 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>R$ {contract.value.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
                  <div className="text-xs text-blue-600 mt-0.5">Total</div>
                </div>
              </div>
              <div className="space-y-2">
                {contractPayments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <CreditCard size={28} className="mx-auto mb-2" />
                    <p className="text-sm">Nenhum pagamento registrado</p>
                  </div>
                ) : contractPayments.map(p => (
                  <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">Parcela {p.installment}</div>
                      <div className="text-xs text-slate-400">Venc. {p.dueDate}{p.method ? ` · ${p.method}` : ''}</div>
                    </div>
                    <StatusBadge status={p.status} size="sm" />
                    <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                      R$ {p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
              {[
                { date: '21/09/2026', time: '14:32', text: 'Muryllo criou o contrato' },
                { date: '21/09/2026', time: '14:40', text: 'PDF gerado automaticamente' },
                { date: '21/09/2026', time: '15:05', text: 'Contrato enviado ao cliente por e-mail' },
                { date: '20/09/2026', time: '09:12', text: 'João da Silva visualizou o contrato' },
                { date: '20/09/2026', time: '10:02', text: 'Contrato assinado digitalmente pelo cliente' },
                { date: '03/09/2026', time: '00:00', text: 'Contrato ativado automaticamente' },
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
