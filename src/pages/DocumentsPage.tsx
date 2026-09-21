import { useState } from 'react';
import { Upload, Search, Download, Trash2, Eye, FolderOpen, FileText, CheckCircle, XCircle } from 'lucide-react';
import { documents } from '../data/mock';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const typeColors: Record<string, { color: string; bg: string }> = {
  PDF: { color: '#DC2626', bg: '#FEF2F2' },
  DOCX: { color: '#2563EB', bg: '#EFF6FF' },
  PNG: { color: '#059669', bg: '#F0FDF4' },
};

export default function DocumentsPage() {
  const [search, setSearch] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [isDragging, setIsDragging] = useState(false);

  const filtered = documents.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.client.toLowerCase().includes(search.toLowerCase())
  );

  const simulateUpload = () => {
    setUploadState('uploading');
    setTimeout(() => setUploadState('success'), 2000);
    setTimeout(() => setUploadState('idle'), 4000);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Documentos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {documents.length} documentos armazenados
          </p>
        </div>
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); simulateUpload(); }}
        className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
        onClick={simulateUpload}
      >
        {uploadState === 'idle' && (
          <>
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
              <Upload size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-sm font-semibold text-slate-700">Arraste arquivos aqui ou clique para selecionar</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>PDF, DOCX, PNG · Máx. 10 MB por arquivo</p>
          </>
        )}
        {uploadState === 'uploading' && (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-700 rounded-full animate-spin mb-3" style={{ borderWidth: 3 }} />
            <p className="text-sm font-semibold text-slate-700">Enviando arquivo...</p>
            <div className="w-48 h-1.5 bg-slate-200 rounded-full mt-3 overflow-hidden">
              <div className="h-full rounded-full animate-pulse" style={{ width: '60%', backgroundColor: 'var(--color-primary)' }} />
            </div>
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
            <p className="text-sm font-semibold text-red-600">Erro ao enviar. Tente novamente.</p>
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

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        {filtered.length === 0 ? (
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
              {filtered.map(d => {
                const typeStyle = typeColors[d.type] ?? { color: '#64748B', bg: '#F1F5F9' };
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: typeStyle.bg, color: typeStyle.color }}>
                          {d.type}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{d.name}</div>
                          <div className="text-xs text-slate-400 capitalize">{d.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-600">{d.client}</td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">#{d.contractId}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{d.size}</td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>{d.date}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Visualizar"><Eye size={14} /></button>
                        <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Baixar"><Download size={14} /></button>
                        <button className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Excluir"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
