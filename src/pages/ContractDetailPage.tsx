import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Send, Download, FileText, Check, Edit2, CreditCard,
  Clock, AlertCircle, Upload, Paperclip
} from 'lucide-react';
import ContractPdfPanel from '../components/ContractPdfPanel';
import ContractSignaturePanel from '../components/ContractSignaturePanel';
import StatusBadge from '../components/StatusBadge';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { RENEWAL_TONE_STYLES, formatDateOnly, renewalIndicator } from '../lib/contract-dates';
import { useAuth } from '../contexts/AuthContext';
import { contractsService } from '../services/contracts';
import { paymentsService } from '../services/payments';
import { auditService } from '../services/audit';
import { documentsService } from '../services/documents';
import type { ContractStatusApi, DocumentCategoryApi, Payment, PaymentMethodApi } from '../types/api';

const STATUS_OPTIONS: { value: ContractStatusApi; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'pronto_envio', label: 'Pronto p/ envio' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'assinado', label: 'Assinado' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'encerrado', label: 'Encerrado' },
  { value: 'cancelado', label: 'Cancelado' },
];

// Espelha backend/src/shared/domain/status-map.ts (CONTRACT_STATUS_TRANSITIONS_MAP).
// Mantido em sincronia manual com o backend — se a máquina de estados mudar
// lá, precisa mudar aqui também. O backend continua sendo a fonte da
// verdade e revalida tudo; isto aqui só evita oferecer opções que o
// backend vai rejeitar com 409.
const STATUS_TRANSITIONS: Record<ContractStatusApi, ContractStatusApi[]> = {
  rascunho: ['pronto_envio', 'enviado', 'cancelado'],
  pronto_envio: ['enviado', 'cancelado'],
  enviado: ['em_revisao', 'assinado', 'cancelado'],
  em_revisao: ['enviado', 'assinado', 'cancelado'],
  assinado: ['ativo', 'cancelado'],
  ativo: ['encerrado'],
  encerrado: [],
  cancelado: [],
};

const PAYMENT_METHODS: PaymentMethodApi[] = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão'];
const DOC_CATEGORIES: DocumentCategoryApi[] = ['contrato', 'procuração', 'documento', 'outro'];

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageContract = user?.role === 'ADMIN' || user?.role === 'LAWYER';
  const [activeTab, setActiveTab] = useState('resumo');

  const { data: contractData, loading: loadingContract, error: contractError, refetch: refetchContract } = useApiQuery(
    () => contractsService.getById(id!),
    [id],
  );
  const contract = contractData?.contract;

  const { data: paymentsData, refetch: refetchPayments } = useApiQuery(
    () => paymentsService.list({ contractId: id, pageSize: 50 }),
    [id],
  );
  const { data: historyData } = useApiQuery(
    () => auditService.list({ entityType: 'Contract', entityId: id, pageSize: 30 }),
    [id],
  );
  const { data: documentsData, refetch: refetchDocuments } = useApiQuery(
    () => documentsService.list({ contractId: id, pageSize: 50 }),
    [id],
  );

  const availableStatusOptions = contract
    ? STATUS_OPTIONS.filter(o => STATUS_TRANSITIONS[contract.status].includes(o.value))
    : [];

  const contractPayments = paymentsData?.data ?? [];
  const totalPaid = contractPayments.filter(p => p.status === 'pago').reduce((s, p) => s + p.value, 0);
  const totalPending = contractPayments.filter(p => p.status !== 'pago' && p.status !== 'cancelado').reduce((s, p) => s + p.value, 0);
  const history = historyData?.data ?? [];
  const contractDocs = documentsData?.data ?? [];
  // PDF (gerado pelo sistema) que corresponde exatamente à versão atual do contrato.
  const currentVersionNumber = contract?.currentVersion?.versionNumber ?? null;
  const currentPdf =
    currentVersionNumber === null
      ? null
      : (contractDocs.find((d) => d.fileType === 'PDF' && d.versionNumber === currentVersionNumber) ?? null);

  // --- Status change -------------------------------------------------
  const [statusDraft, setStatusDraft] = useState<ContractStatusApi | ''>('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function applyStatus(next: ContractStatusApi) {
    setStatusError(null);
    setStatusUpdating(true);
    try {
      await contractsService.updateStatus(id!, next);
      await refetchContract();
      setStatusDraft('');
    } catch (err) {
      setStatusError(toErrorMessage(err, 'Não foi possível alterar o status.'));
    } finally {
      setStatusUpdating(false);
    }
  }

  // --- Edit contract (só em rascunho) ---------------------------------
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ value: '', object: '', startDate: '', endDate: '', deadline: '', conditions: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit() {
    if (!contract) return;
    setEditForm({
      value: String(contract.value),
      object: contract.object,
      startDate: contract.startDate.slice(0, 10),
      endDate: contract.endDate ? contract.endDate.slice(0, 10) : '',
      deadline: contract.termText ?? '',
      conditions: contract.conditions ?? '',
    });
    setEditError(null);
    setShowEdit(true);
  }

  async function handleEditSave() {
    setEditError(null);
    setEditSaving(true);
    try {
      await contractsService.update(id!, {
        value: Number(editForm.value),
        object: editForm.object,
        startDate: editForm.startDate,
        // vazio remove a data de término (null); o backend valida término >= início.
        endDate: editForm.endDate || null,
        termText: editForm.deadline || undefined,
        conditions: editForm.conditions || undefined,
      });
      setShowEdit(false);
      refetchContract();
    } catch (err) {
      setEditError(toErrorMessage(err, 'Não foi possível salvar as alterações.'));
    } finally {
      setEditSaving(false);
    }
  }

  // --- Registrar novo pagamento ---------------------------------------
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ installmentNumber: '1', installmentTotal: '1', value: '', dueDate: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function handleCreatePayment() {
    setPaymentError(null);
    setPaymentSaving(true);
    try {
      await paymentsService.create({
        contractId: id!,
        installmentNumber: Number(paymentForm.installmentNumber),
        installmentTotal: Number(paymentForm.installmentTotal),
        value: Number(paymentForm.value),
        dueDate: paymentForm.dueDate,
      });
      setShowNewPayment(false);
      setPaymentForm({ installmentNumber: '1', installmentTotal: '1', value: '', dueDate: '' });
      refetchPayments();
    } catch (err) {
      setPaymentError(toErrorMessage(err, 'Não foi possível registrar a parcela.'));
    } finally {
      setPaymentSaving(false);
    }
  }

  // --- Registrar recebimento de uma parcela ---------------------------
  const [registeringPayment, setRegisteringPayment] = useState<Payment | null>(null);
  const [registerMethod, setRegisterMethod] = useState<PaymentMethodApi>('PIX');
  const [registerSaving, setRegisterSaving] = useState(false);

  async function handleRegisterPayment() {
    if (!registeringPayment) return;
    setRegisterSaving(true);
    try {
      await paymentsService.registerPayment(registeringPayment.id, { method: registerMethod });
      setRegisteringPayment(null);
      refetchPayments();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível registrar o pagamento.'));
    } finally {
      setRegisterSaving(false);
    }
  }

  // --- Upload de documento ---------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategoryApi>('documento');
  const [uploading, setUploading] = useState(false);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      await documentsService.upload({ contractId: id, category: uploadCategory, file });
      refetchDocuments();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível enviar o documento.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (loadingContract) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (contractError || !contract) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => navigate('/contratos')} className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>
          <ArrowLeft size={14} /> Contratos
        </button>
        <div className="flex items-center gap-2 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <AlertCircle size={15} /> {toErrorMessage(contractError, 'Contrato não encontrado.')}
        </div>
      </div>
    );
  }

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
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">#{contract.number}</span>
              <StatusBadge status={contract.status} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-2" style={{ fontFamily: 'var(--font-display)' }}>{contract.template.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
              Cliente: <span className="font-medium text-slate-700 cursor-pointer hover:underline" onClick={() => navigate(`/clientes/${contract.client.id}`)}>{contract.client.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusDraft || contract.status}
              onChange={e => setStatusDraft(e.target.value as ContractStatusApi)}
              disabled={availableStatusOptions.length === 0}
              className="px-3 py-2 text-sm border rounded-lg bg-white text-slate-600 disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <option value={contract.status}>{STATUS_OPTIONS.find(s => s.value === contract.status)?.label}</option>
              {availableStatusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              disabled={!statusDraft || statusDraft === contract.status || statusUpdating || availableStatusOptions.length === 0}
              onClick={() => statusDraft && applyStatus(statusDraft)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Send size={14} /> {statusUpdating ? 'Aplicando...' : 'Aplicar status'}
            </button>
          </div>
        </div>

        {statusError && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
            <AlertCircle size={15} className="flex-shrink-0" /> {statusError}
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {[
            { label: 'Valor', value: contract.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
            { label: 'Início', value: formatDateOnly(contract.startDate) },
            { label: 'Término', value: contract.endDate ? formatDateOnly(contract.endDate) : '—' },
            { label: 'Última atualização', value: new Date(contract.updatedAt).toLocaleDateString('pt-BR') },
            { label: 'Responsável', value: contract.responsible.name },
          ].map(m => (
            <div key={m.label}>
              <div className="text-xs text-slate-400 mb-0.5">{m.label}</div>
              <div className="text-sm font-semibold text-slate-800 tabular-nums" style={{ fontFamily: m.label === 'Valor' ? 'var(--font-mono)' : undefined }}>{m.value}</div>
              {m.label === 'Término' && (() => {
                const indicator = renewalIndicator(contract);
                return indicator ? (
                  <span className="inline-block mt-1 text-xs font-semibold px-1.5 py-0.5 rounded" style={RENEWAL_TONE_STYLES[indicator.tone]}>
                    {indicator.label}
                  </span>
                ) : null;
              })()}
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
                    { label: 'Número', value: `#${contract.number}` },
                    { label: 'Modelo', value: contract.template.name },
                    { label: 'Cliente', value: contract.client.name },
                    { label: 'Objeto', value: contract.object },
                    { label: 'Valor total', value: contract.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
                    { label: 'Responsável', value: contract.responsible.name },
                  ].map(f => (
                    <div key={f.label} className="flex items-start justify-between gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                      <span className="text-xs text-slate-400 flex-shrink-0 w-28">{f.label}</span>
                      <span className="text-sm font-medium text-slate-800 text-right">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Ações rápidas</h3>
                <div className="space-y-2">
                  {contract.status === 'rascunho' && (
                    <button onClick={openEdit} className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left" style={{ borderColor: 'var(--color-border)' }}>
                      <Edit2 size={15} style={{ color: '#475569' }} />
                      <span className="text-sm font-medium text-slate-700">Editar contrato</span>
                    </button>
                  )}
                  {(contract.status === 'rascunho' || contract.status === 'pronto_envio') && (
                    <button onClick={() => applyStatus('enviado')} disabled={statusUpdating} className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left disabled:opacity-50" style={{ borderColor: 'var(--color-border)' }}>
                      <Send size={15} style={{ color: 'var(--color-primary)' }} />
                      <span className="text-sm font-medium text-slate-700">Enviar para assinatura</span>
                    </button>
                  )}
                  {canManageContract && (contract.status === 'enviado' || contract.status === 'em_revisao') && (
                    <button onClick={() => setActiveTab('documento')} className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left" style={{ borderColor: 'var(--color-border)' }}>
                      <Send size={15} style={{ color: '#7C3AED' }} />
                      <span className="text-sm font-medium text-slate-700">Gerar link de aceite eletrônico</span>
                    </button>
                  )}
                  <button onClick={() => setShowNewPayment(true)} className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left" style={{ borderColor: 'var(--color-border)' }}>
                    <CreditCard size={15} style={{ color: '#059669' }} />
                    <span className="text-sm font-medium text-slate-700">Registrar parcela / pagamento</span>
                  </button>
                  <button onClick={() => setActiveTab('documento')} className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left" style={{ borderColor: 'var(--color-border)' }}>
                    <FileText size={15} style={{ color: '#475569' }} />
                    <span className="text-sm font-medium text-slate-700">{currentPdf ? 'Ver PDF' : 'Gerar PDF'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documento' && (
            <div>
              <ContractPdfPanel
                contractId={contract.id}
                contractNumber={contract.number}
                versionNumber={currentVersionNumber}
                content={contract.currentVersion?.content ?? null}
                pdf={currentPdf}
                onGenerated={refetchDocuments}
              />

              <ContractSignaturePanel contractId={contract.id} contractStatus={contract.status} />

              <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Arquivos anexados</h4>
                  <div className="flex items-center gap-2">
                    <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value as DocumentCategoryApi)} className="px-2 py-1.5 text-xs border rounded-lg" style={{ borderColor: 'var(--color-border)' }} aria-label="Categoria do arquivo">
                      {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-50"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <Upload size={12} /> {uploading ? 'Enviando...' : 'Anexar arquivo'}
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
                  </div>
                </div>

                {contractDocs.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">Nenhum arquivo anexado.</p>
                ) : (
                  <div className="space-y-2">
                    {contractDocs.map(d => (
                      <button
                        type="button"
                        key={d.id}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors text-left"
                        style={{ borderColor: 'var(--color-border)' }}
                        onClick={() => documentsService.download(d.id, d.fileName)}
                      >
                        <Paperclip size={14} className="text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{d.fileName}</div>
                          <div className="text-xs text-slate-400">
                            {(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                            {d.versionNumber ? ` · versão ${d.versionNumber}` : ''}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full flex-shrink-0">{d.category}</span>
                        <Download size={13} className="text-slate-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'pagamentos' && (
            <div>
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowNewPayment(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                  + Nova parcela
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="text-center p-4 rounded-xl" style={{ backgroundColor: '#F0FDF4' }}>
                  <div className="text-lg font-bold text-green-700 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                  <div className="text-xs text-green-600 mt-0.5">Pago</div>
                </div>
                <div className="text-center p-4 rounded-xl" style={{ backgroundColor: '#FFFBEB' }}>
                  <div className="text-lg font-bold text-amber-700 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{totalPending.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                  <div className="text-xs text-amber-600 mt-0.5">Pendente</div>
                </div>
                <div className="text-center p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF' }}>
                  <div className="text-lg font-bold text-blue-700 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{contract.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                  <div className="text-xs text-blue-600 mt-0.5">Total do contrato</div>
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
                      <div className="text-sm font-medium text-slate-800">Parcela {p.installmentNumber}/{p.installmentTotal}</div>
                      <div className="text-xs text-slate-400">Venc. {new Date(p.dueDate).toLocaleDateString('pt-BR')}{p.method ? ` · ${p.method}` : ''}</div>
                    </div>
                    <StatusBadge status={p.status} size="sm" />
                    <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                      {p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    {p.status !== 'pago' && p.status !== 'cancelado' && (
                      <button
                        onClick={() => { setRegisteringPayment(p); setRegisterMethod('PIX'); }}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border hover:bg-slate-50 text-slate-600 flex-shrink-0"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        Registrar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="relative pl-6">
              {history.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Clock size={28} className="mx-auto mb-2" />
                  <p className="text-sm">Nenhum evento registrado</p>
                </div>
              ) : (
                <>
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                  {history.map((item) => {
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

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Editar contrato</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Uma nova versão do documento será gerada.</p>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {editError && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  <AlertCircle size={15} className="flex-shrink-0" /> {editError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Valor (R$) *</label>
                  <input value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Data de início *</label>
                  <input type="date" value={editForm.startDate} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Data de término (opcional)</label>
                  <input type="date" min={editForm.startDate || undefined} value={editForm.endDate} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Prazo / Duração</label>
                  <input value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Objeto *</label>
                  <textarea rows={2} value={editForm.object} onChange={e => setEditForm(f => ({ ...f, object: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg resize-none" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Condições específicas</label>
                  <textarea rows={2} value={editForm.conditions} onChange={e => setEditForm(f => ({ ...f, conditions: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg resize-none" style={{ borderColor: 'var(--color-border)' }} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              <button onClick={handleEditSave} disabled={editSaving} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
                {editSaving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New payment modal */}
      {showNewPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Nova parcela</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {paymentError && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  <AlertCircle size={15} className="flex-shrink-0" /> {paymentError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Parcela nº</label>
                  <input type="number" min={1} value={paymentForm.installmentNumber} onChange={e => setPaymentForm(f => ({ ...f, installmentNumber: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Total de parcelas</label>
                  <input type="number" min={1} value={paymentForm.installmentTotal} onChange={e => setPaymentForm(f => ({ ...f, installmentTotal: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Valor (R$) *</label>
                  <input value={paymentForm.value} onChange={e => setPaymentForm(f => ({ ...f, value: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Vencimento *</label>
                  <input type="date" value={paymentForm.dueDate} onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setShowNewPayment(false)} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              <button onClick={handleCreatePayment} disabled={paymentSaving || !paymentForm.value || !paymentForm.dueDate} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
                {paymentSaving ? 'Salvando...' : 'Criar parcela'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register payment modal */}
      {registeringPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Registrar pagamento</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                Parcela {registeringPayment.installmentNumber}/{registeringPayment.installmentTotal} — {registeringPayment.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Forma de pagamento</label>
              <select value={registerMethod} onChange={e => setRegisterMethod(e.target.value as PaymentMethodApi)} className="w-full px-3 py-2 text-sm border rounded-lg" style={{ borderColor: 'var(--color-border)' }}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setRegisteringPayment(null)} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
              <button onClick={handleRegisterPayment} disabled={registerSaving} className="px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#059669' }}>
                {registerSaving ? 'Registrando...' : <><Check size={14} className="inline mr-1" />Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
