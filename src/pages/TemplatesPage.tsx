import { useState } from 'react';
import { Plus, Search, BookOpen, Edit2, Copy, Trash2, Code, AlertCircle } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { templatesService } from '../services/templates';
import type { ContractTemplate } from '../types/api';

const variablesPanel = {
  'Cliente': ['{{cliente.nome}}', '{{cliente.cpf}}', '{{cliente.email}}', '{{cliente.telefone}}', '{{cliente.endereco}}'],
  'Contrato': ['{{contrato.valor}}', '{{contrato.data_inicio}}', '{{contrato.data_fim}}', '{{contrato.prazo}}', '{{contrato.objeto}}', '{{contrato.numero}}'],
  'Advogado': ['{{advogado.nome}}', '{{advogado.oab}}', '{{advogado.email}}', '{{advogado.escritorio}}'],
};

const BLANK_CONTENT = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS JURÍDICOS

CONTRATANTE:
{{cliente.nome}}

CPF/CNPJ:
{{cliente.cpf}}

ENDEREÇO:
{{cliente.endereco}}

OBJETO DO CONTRATO:
{{contrato.objeto}}

VALOR:
{{contrato.valor}}

DATA DE INÍCIO:
{{contrato.data_inicio}}

PRAZO:
{{contrato.prazo}}

ADVOGADO RESPONSÁVEL:
{{advogado.nome}}

OAB:
{{advogado.oab}}`;

export default function TemplatesPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApiQuery(
    () => templatesService.list({ search: search || undefined, pageSize: 50 }),
    [search],
  );
  const templates = data?.data ?? [];

  const openNew = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormContent(BLANK_CONTENT);
    setFormError(null);
    setShowEditor(true);
  };

  const openEdit = (t: ContractTemplate) => {
    setEditing(t);
    setFormName(t.name);
    setFormDescription(t.description ?? '');
    setFormContent(t.content);
    setFormError(null);
    setShowEditor(true);
  };

  const handleCopy = (v: string) => {
    navigator.clipboard.writeText(v);
    setCopiedVar(v);
    setTimeout(() => setCopiedVar(null), 1200);
  };

  async function handleSave() {
    setFormError(null);
    setSaving(true);
    try {
      if (editing) {
        await templatesService.update(editing.id, { name: formName, description: formDescription || undefined, content: formContent });
      } else {
        await templatesService.create({ name: formName, description: formDescription || undefined, content: formContent });
      }
      setShowEditor(false);
      refetch();
    } catch (err) {
      setFormError(toErrorMessage(err, 'Não foi possível salvar o modelo.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(t: ContractTemplate) {
    try {
      await templatesService.create({ name: `${t.name} (cópia)`, description: t.description ?? undefined, content: t.content });
      refetch();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível duplicar o modelo.'));
    }
  }

  async function handleDelete(t: ContractTemplate) {
    if (!window.confirm(`Excluir o modelo "${t.name}"?`)) return;
    try {
      await templatesService.remove(t.id);
      refetch();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível excluir o modelo.'));
    }
  }

  if (showEditor) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowEditor(false)} className="text-sm text-slate-500 hover:text-slate-900">← Modelos</button>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-900">{editing ? editing.name : 'Novo modelo'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEditor(false)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-slate-50 text-slate-600" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
            <button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formContent.trim()}
              className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? 'Salvando...' : 'Salvar modelo'}
            </button>
          </div>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {formError && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                <AlertCircle size={15} className="flex-shrink-0" /> {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome do modelo *</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)' }}
                  placeholder="Contrato de Prestação de Serviços"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Descrição</label>
                <input
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--color-border)' }}
                  placeholder="Breve descrição do modelo"
                />
              </div>
            </div>
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              className="w-full h-full min-h-96 p-4 text-sm border rounded-xl focus:outline-none focus:ring-2 resize-none leading-relaxed"
              style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
            />
          </div>
          <div className="w-64 border-l flex-shrink-0 bg-white overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Code size={14} style={{ color: 'var(--color-primary)' }} />
                <span className="text-sm font-semibold text-slate-900">Variáveis disponíveis</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">Clique para copiar e cole no texto</p>
              {Object.entries(variablesPanel).map(([group, vars]) => (
                <div key={group} className="mb-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{group}</div>
                  <div className="space-y-1">
                    {vars.map(v => (
                      <button
                        key={v}
                        onClick={() => handleCopy(v)}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-all ${copiedVar === v ? 'bg-green-100 text-green-700' : 'hover:bg-blue-50 text-blue-700'}`}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {copiedVar === v ? '✓ Copiado!' : v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Modelos de contrato</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {data ? `${data.pagination.total} modelos disponíveis` : 'Carregando...'}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={16} /> Novo modelo
        </button>
      </div>

      <div className="relative max-w-sm mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar modelos..."
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
          style={{ borderColor: 'var(--color-border)' }}
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{toErrorMessage(error, 'Não foi possível carregar os modelos.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Modelo</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell text-center">Utilizações</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Atualizado em</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-16 text-center">
                <div className="w-6 h-6 mx-auto rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              </td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center">
                <BookOpen size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Nenhum modelo encontrado</p>
              </td></tr>
            ) : templates.map(t => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: '#EFF6FF' }}>
                      <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{t.description}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 hidden md:table-cell text-center">
                  <span className="text-sm font-semibold text-slate-700">{t.usageCount}x</span>
                </td>
                <td className="px-5 py-4 hidden md:table-cell">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(t.updatedAt).toLocaleDateString('pt-BR')}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={t.status} size="sm" />
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Editar">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDuplicate(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Duplicar">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => handleDelete(t)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
