import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, User, FileText, Info, Eye, Rocket, Search, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { clientsService } from '../services/clients';
import { templatesService } from '../services/templates';
import { contractsService } from '../services/contracts';
import type { Contract } from '../types/api';

const steps = [
  { id: 1, label: 'Cliente', icon: User },
  { id: 2, label: 'Modelo', icon: FileText },
  { id: 3, label: 'Informações', icon: Info },
  { id: 4, label: 'Revisão', icon: Eye },
  { id: 5, label: 'Finalização', icon: Rocket },
];

export default function NewContractPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [formData, setFormData] = useState({ value: '', object: '', startDate: '', endDate: '', deadline: '', conditions: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<Contract | null>(null);

  const { data: clientsData } = useApiQuery(
    () => clientsService.list({ pageSize: 50, status: 'ativo', search: clientSearch || undefined }),
    [clientSearch],
  );
  const { data: templatesData } = useApiQuery(
    () => templatesService.list({ pageSize: 50, status: 'ativo' }),
    [],
  );

  const clients = clientsData?.data ?? [];
  const templates = templatesData?.data ?? [];

  const client = clients.find(c => c.id === selectedClient);
  const template = templates.find(t => t.id === selectedTemplate);

  const canProceed = () => {
    if (step === 1) return selectedClient !== null;
    if (step === 2) return selectedTemplate !== null;
    // Término é opcional, mas quando informado não pode ser anterior ao início (o backend revalida).
    if (step === 3) {
      const endOk = !formData.endDate || !formData.startDate || formData.endDate >= formData.startDate;
      return formData.value && formData.object && formData.startDate && endOk;
    }
    return true;
  };

  async function handleFinish() {
    if (!selectedClient || !selectedTemplate) return;
    setCreateError(null);
    setCreating(true);
    try {
      const response = await contractsService.create({
        clientId: selectedClient,
        templateId: selectedTemplate,
        value: Number(formData.value.replace(/\./g, '').replace(',', '.')) || Number(formData.value),
        object: formData.object,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        termText: formData.deadline || undefined,
        conditions: formData.conditions || undefined,
      });
      setCreated(response.contract);
      setStep(5);
    } catch (err) {
      setCreateError(toErrorMessage(err, 'Não foi possível criar o contrato.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/contratos')} className="flex items-center gap-2 text-sm mb-6 hover:text-slate-900" style={{ color: 'var(--color-muted-foreground)' }}>
        <ArrowLeft size={14} /> Contratos
      </button>

      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Novo contrato</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Siga os passos abaixo para criar um contrato</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center mb-8 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  step > s.id ? 'text-white' : step === s.id ? 'text-white' : 'border-2 text-slate-400 bg-white'
                }`}
                style={
                  step > s.id ? { backgroundColor: '#059669' } :
                  step === s.id ? { backgroundColor: 'var(--color-primary)' } :
                  { borderColor: 'var(--color-border)' }
                }
              >
                {step > s.id ? <Check size={16} /> : <s.icon size={15} />}
              </div>
              <span
                className={`text-xs mt-1 font-medium whitespace-nowrap ${step === s.id ? 'text-slate-900' : 'text-slate-400'}`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-12 md:w-20 h-px mx-2 mb-4 flex-shrink-0" style={{ backgroundColor: step > s.id ? '#059669' : 'var(--color-border)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border p-6 min-h-80" style={{ borderColor: 'var(--color-border)' }}>
        {step === 1 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Selecionar cliente</h2>
            <p className="text-sm mb-3" style={{ color: 'var(--color-muted-foreground)' }}>Escolha o cliente para este contrato</p>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
            {clients.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted-foreground)' }}>
                Nenhum cliente ativo encontrado. Cadastre um cliente antes de criar o contrato.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {clients.map(c => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                      selectedClient === c.id ? 'border-blue-700 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input type="radio" name="client" className="sr-only" checked={selectedClient === c.id} onChange={() => setSelectedClient(c.id)} />
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.document} · {c.email}</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedClient === c.id ? 'border-blue-700 bg-blue-700' : 'border-slate-300'}`}>
                      {selectedClient === c.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Selecionar modelo</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--color-muted-foreground)' }}>Escolha o modelo base para o contrato</p>
            {templates.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted-foreground)' }}>
                Nenhum modelo ativo encontrado. Cadastre um modelo em "Modelos" antes de criar o contrato.
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedTemplate === t.id ? 'border-blue-700 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input type="radio" name="template" className="sr-only" checked={selectedTemplate === t.id} onChange={() => setSelectedTemplate(t.id)} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{t.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{t.description}</div>
                      <div className="text-xs text-slate-400 mt-1">Utilizado {t.usageCount}x · Atualizado em {new Date(t.updatedAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedTemplate === t.id ? 'border-blue-700 bg-blue-700' : 'border-slate-300'}`}>
                      {selectedTemplate === t.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Informações do contrato</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--color-muted-foreground)' }}>Preencha os dados que serão inseridos no contrato</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Valor (R$) *</label>
                <input value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} placeholder="0,00" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Data de início *</label>
                <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Data de término (opcional)</label>
                <input type="date" min={formData.startDate || undefined} value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: formData.endDate && formData.startDate && formData.endDate < formData.startDate ? '#DC2626' : 'var(--color-border)' }} />
                {formData.endDate && formData.startDate && formData.endDate < formData.startDate && (
                  <p className="text-xs mt-1" style={{ color: '#DC2626' }}>A data de término não pode ser anterior à data de início.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Prazo / Duração</label>
                <input value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} placeholder="Ex: 12 meses" className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Objeto do contrato *</label>
                <textarea rows={2} value={formData.object} onChange={e => setFormData({...formData, object: e.target.value})} placeholder="Descreva o objeto da prestação de serviços..." className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none" style={{ borderColor: 'var(--color-border)' }} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Condições específicas</label>
                <textarea rows={2} value={formData.conditions} onChange={e => setFormData({...formData, conditions: e.target.value})} placeholder="Cláusulas ou condições específicas..." className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 resize-none" style={{ borderColor: 'var(--color-border)' }} />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Revisão do contrato</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--color-muted-foreground)' }}>Verifique as informações antes de finalizar. O texto completo, gerado a partir do modelo, ficará disponível na página do contrato.</p>
            <div className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.8', color: '#374151' }}>
              <div className="text-center font-semibold text-sm mb-6 text-slate-900">CONTRATO DE {template?.name?.toUpperCase() ?? 'PRESTAÇÃO DE SERVIÇOS JURÍDICOS'}</div>
              <div className="space-y-2">
                <div><span className="text-slate-400">CONTRATANTE:</span> <span className="text-blue-700 font-medium">{client?.name ?? '{{cliente.nome}}'}</span></div>
                <div><span className="text-slate-400">CPF/CNPJ:</span> <span className="text-blue-700 font-medium">{client?.document ?? '{{cliente.cpf}}'}</span></div>
                <div className="mt-2"><span className="text-slate-400">OBJETO:</span> <span className="text-blue-700 font-medium">{formData.object || '{{contrato.objeto}}'}</span></div>
                <div><span className="text-slate-400">VALOR:</span> <span className="text-blue-700 font-medium">{formData.value ? `R$ ${formData.value}` : '{{contrato.valor}}'}</span></div>
                <div><span className="text-slate-400">INÍCIO:</span> <span className="text-blue-700 font-medium">{formData.startDate ? new Date(formData.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : '{{contrato.data_inicio}}'}</span></div>
                <div><span className="text-slate-400">TÉRMINO:</span> <span className="text-blue-700 font-medium">{formData.endDate ? new Date(formData.endDate + 'T00:00:00').toLocaleDateString('pt-BR') : '{{contrato.data_fim}}'}</span></div>
                <div><span className="text-slate-400">PRAZO:</span> <span className="text-blue-700 font-medium">{formData.deadline || '{{contrato.prazo}}'}</span></div>
                <div className="mt-4 text-slate-400">ADVOGADO RESPONSÁVEL:</div>
                <div><span className="text-slate-400">NOME:</span> <span className="text-blue-700 font-medium">{user?.name}</span></div>
                <div><span className="text-slate-400">OAB:</span> <span className="text-blue-700 font-medium">{user?.oabNumber ?? '—'}</span></div>
              </div>
            </div>
            <div className="mt-3 p-3 rounded-lg text-xs text-blue-700 flex items-start gap-2" style={{ backgroundColor: '#EFF6FF' }}>
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <span>Os campos em azul foram preenchidos automaticamente com os dados informados. Revise antes de prosseguir.</span>
            </div>
            {createError && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                <AlertCircle size={15} className="flex-shrink-0" /> {createError}
              </div>
            )}
          </div>
        )}

        {step === 5 && created && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#F0FDF4' }}>
              <Check size={28} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-display)' }}>Contrato #{created.number} criado com sucesso!</h2>
            <p className="text-sm mb-8" style={{ color: 'var(--color-muted-foreground)' }}>
              O contrato foi gerado como <strong>Rascunho</strong>. Escolha como deseja prosseguir.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/contratos')}
                className="px-5 py-2.5 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Voltar para contratos
              </button>
              <button
                onClick={() => navigate(`/contratos/${created.id}`)}
                className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Ver contrato
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 5 && (
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : navigate('/contratos')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <ArrowLeft size={15} /> {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          <button
            onClick={() => step === 4 ? handleFinish() : setStep(step + 1)}
            disabled={!canProceed() || creating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {creating ? 'Criando...' : step === 4 ? 'Finalizar' : 'Continuar'} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
