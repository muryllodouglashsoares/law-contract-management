import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Search, Download, Trash2, FolderOpen, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useApiQuery, toErrorMessage } from '../hooks/useApiQuery';
import { documentsService } from '../services/documents';
import { contractsService } from '../services/contracts';
import type { DocumentCategoryApi } from '../types/api';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const typeColors: Record<string, { color: string; bg: string }> = {
  PDF: { color: '#DC2626', bg: '#FEF2F2' },
  DOCX: { color: '#2563EB', bg: '#EFF6FF' },
  PNG: { color: '#059669', bg: '#F0FDF4' },
  JPG: { color: '#059669', bg: '#F0FDF4' },
};

const PAGE_SIZE = 20;

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [targetContractId, setTargetContractId] = useState('');
  const [targetCategory, setTargetCategory] = useState<DocumentCategoryApi>('documento');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, error, refetch } = useApiQuery(
    () => documentsService.list({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    [page, debouncedSearch],
  );
  const { data: contractsData } = useApiQuery(() => contractsService.list({ pageSize: 100 }), []);

  const documents = data?.data ?? [];
  const pagination = data?.pagination;
  const contracts = contractsData?.data ?? [];

  async function handleFile(file: File) {
    if (!targetContractId) {
      setUploadErrorMsg('Selecione o contrato ao qual este documento pertence.');
      setUploadState('error');
      return;
    }
    setUploadState('uploading');
    setUploadErrorMsg(null);
    try {
      await documentsService.upload({ contractId: targetContractId, category: targetCategory, file });
      setUploadState('success');
      refetch();
    } catch (err) {
      setUploadErrorMsg(toErrorMessage(err, 'Não foi possível enviar o arquivo.'));
      setUploadState('error');
    } finally {
      setTimeout(() => setUploadState('idle'), 2500);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Excluir o documento "${name}"?`)) return;
    try {
      await documentsService.remove(id);
      refetch();
    } catch (err) {
      window.alert(toErrorMessage(err, 'Não foi possível excluir o documento.'));
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Documentos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {pagination ? `${pagination.total} documentos armazenados` : 'Carregando...'}
          </p>
        </div>
      </div>

      {/* Contract + category selection for upload */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={targetContractId}
          onChange={e => setTargetContractId(e.target.value)}
          className="px-3 py-2 text-sm border rounded-lg bg-white text-slate-600 max-w-xs"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <option value="">Selecione o contrato de destino...</option>
          {contracts.map(c => (
            <option key={c.id} value={c.id}>#{c.number} · {c.client.name}</option>
          ))}
        </select>
        <select
          value={targetCategory}
          onChange={e => setTargetCategory(e.target.value as DocumentCategoryApi)}
          className="px-3 py-2 text-sm border rounded-lg bg-white text-slate-600"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <option value="documento">Documento</option>
          <option value="contrato">Contrato</option>
          <option value="procuração">Procuração</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        {uploadState === 'idle' && (
          <>
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
              <Upload size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-sm font-semibold text-slate-700">Arraste arquivos aqui ou clique para selecionar</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Máx. 10 MB por arquivo · selecione o contrato de destino acima</p>
          </>
        )}
        {uploadState === 'uploading' && (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-700 rounded-full animate-spin mb-3" style={{ borderWidth: 3 }} />
            <p className="text-sm font-semibold text-slate-700">Enviando arquivo...</p>
          </div>
        )}
        {uploadState === 'success' && (
          <div className="flex flex-col items-center">
            <CheckCircle size={28} className="text-green-600 mb-2" />
            <p className="text-sm font-semibold text-green-700">Arquivo enviado com sucesso!</p>
          </div>
        )}
        {uploadState === 'error' && (
          <div className="flex flex-col items-center">
            <XCircle size={28} className="text-red-500 mb-2" />
            <p className="text-sm font-semibold text-red-600">{uploadErrorMsg ?? 'Erro ao enviar. Tente novamente.'}</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar documentos..."
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
          style={{ borderColor: 'var(--color-border)' }}
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          <span className="flex items-center gap-2"><AlertCircle size={15} />{toErrorMessage(error, 'Não foi possível carregar os documentos.')}</span>
          <button onClick={refetch} className="font-semibold underline flex-shrink-0">Tentar novamente</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-6 h-6 mx-auto rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center">
            <FolderOpen size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Nenhum documento encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Nome</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Cliente</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Contrato</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Tamanho</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Data</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(d => {
                const typeStyle = typeColors[d.fileType] ?? { color: '#64748B', bg: '#F1F5F9' };
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: typeStyle.bg, color: typeStyle.color }}>
                          {d.fileType}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{d.fileName}</div>
                          <div className="text-xs text-slate-400 capitalize">{d.category}{d.versionNumber ? ` · versão ${d.versionNumber}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-600">{d.contract.client.name}</td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span
                        className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded cursor-pointer hover:bg-slate-200"
                        onClick={() => navigate(`/contratos/${d.contract.id}`)}
                      >
                        #{d.contract.number}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      {(d.sizeBytes / 1024).toFixed(0)} KB
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => documentsService.download(d.id, d.fileName)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Baixar"><Download size={14} /></button>
                        <button onClick={() => handleDelete(d.id, d.fileName)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Excluir"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FAFAFA' }}>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Exibindo {documents.length} de {pagination.total}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Anterior</button>
              <span className="px-3 py-1 text-xs border rounded font-semibold text-white" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary)' }}>{pagination.page}</span>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page >= pagination.totalPages} className="px-3 py-1 text-xs border rounded bg-white text-slate-600 disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
