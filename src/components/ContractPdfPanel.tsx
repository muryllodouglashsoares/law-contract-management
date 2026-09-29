import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';

import { ApiError } from '../lib/api-client';
import { contractsService } from '../services/contracts';
import { documentsService } from '../services/documents';
import type { AppDocument } from '../types/api';

interface ContractPdfPanelProps {
  contractId: string;
  contractNumber: number;
  /** Versão atual do contrato (a que o usuário está vendo). null = sem versão. */
  versionNumber: number | null;
  /** Texto oficial da versão (ContractVersion.content), exibido enquanto não há PDF. */
  content: string | null;
  /** PDF já existente para a versão atual, vindo da lista de documentos do contrato. */
  pdf: AppDocument | null;
  /** Chamado após gerar, para o pai recarregar a lista de documentos. */
  onGenerated: () => void;
}

const BORDER = { borderColor: 'var(--color-border)' } as const;

function formatSize(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ContractPdfPanel({
  contractId,
  contractNumber,
  versionNumber,
  content,
  pdf,
  onGenerated,
}: ContractPdfPanelProps) {
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [generated, setGenerated] = useState<AppDocument | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const busyRef = useRef(false); // trava síncrona: dois cliques rápidos não disparam duas requisições

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  // Enquanto a lista de documentos recarrega, usa o documento devolvido pela geração.
  const currentPdf = pdf ?? (generated && generated.versionNumber === versionNumber ? generated : null);
  const currentPdfId = currentPdf?.id ?? null;

  // Se o Document existe mas o arquivo sumiu do storage (404), o backend o regenera a partir
  // do texto da versão ao receber o pedido de geração (idempotente). Tenta uma única vez.
  async function withRestore<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404 || versionNumber === null) throw error;
      await contractsService.generatePdf(contractId, versionNumber);
      return action();
    }
  }

  // Visualização: baixa o PDF autenticado como Blob e exibe via URL local.
  // Nunca expõe uma URL pública do arquivo.
  useEffect(() => {
    setPreviewUrl(null);
    setPreviewFailed(false);
    if (!currentPdfId) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewLoading(true);

    withRestore(() => documentsService.preview(currentPdfId))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentPdfId]);

  async function handleGenerate() {
    if (busyRef.current || versionNumber === null) return;
    busyRef.current = true;
    setGenerating(true);
    setGenerateError(false);
    setActionError(null);
    try {
      // Envia a versão exibida: o PDF gerado é exatamente o que o usuário está vendo.
      const { document } = await contractsService.generatePdf(contractId, versionNumber);
      setGenerated(document);
      onGenerated();
    } catch {
      setGenerateError(true);
    } finally {
      busyRef.current = false;
      setGenerating(false);
    }
  }

  async function handleDownload() {
    if (!currentPdf) return;
    setActionError(null);
    try {
      await withRestore(() => documentsService.download(currentPdf.id, currentPdf.fileName));
    } catch (error) {
      setActionError(
        error instanceof ApiError && error.status !== 404
          ? `Não foi possível baixar o PDF: ${error.message}`
          : 'Não foi possível baixar o PDF. Tente novamente.',
      );
    }
  }

  const buttonBase =
    'flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg w-full sm:w-auto ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  const outlineButton = `${buttonBase} border bg-white text-slate-700 hover:bg-slate-50`;
  const primaryButton = `${buttonBase} text-white hover:opacity-90`;

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Documento do contrato</h3>
          <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            Contrato #{contractNumber}
            {versionNumber !== null ? ` · Versão ${versionNumber}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {currentPdf ? (
            <>
              {previewUrl && (
                <button
                  type="button"
                  className={outlineButton}
                  style={BORDER}
                  onClick={() => window.open(previewUrl, '_blank', 'noopener')}
                >
                  <ExternalLink size={14} /> Abrir em nova aba
                </button>
              )}
              <button
                type="button"
                className={primaryButton}
                style={{ backgroundColor: 'var(--color-primary)' }}
                onClick={handleDownload}
              >
                <Download size={14} /> Baixar PDF
              </button>
            </>
          ) : (
            versionNumber !== null && (
              <button
                type="button"
                className={primaryButton}
                style={{ backgroundColor: 'var(--color-primary)' }}
                onClick={handleGenerate}
                disabled={generating}
                aria-busy={generating}
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {generating ? 'Gerando PDF...' : 'Gerar PDF'}
              </button>
            )
          )}
        </div>
      </div>

      {/* Estado do PDF */}
      <div aria-live="polite">
        {generating && (
          <div className="flex items-center gap-2 px-3 py-2.5 mb-4 text-sm rounded-lg bg-slate-50 text-slate-600" role="status">
            <Loader2 size={15} className="animate-spin flex-shrink-0" /> Gerando PDF da versão {versionNumber}...
          </div>
        )}

        {generateError && !generating && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 flex-wrap px-3 py-2.5 mb-4 text-sm rounded-lg"
            style={{ backgroundColor: '#FEF2F2', color: '#B91C1C' }}
          >
            <span className="flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              Não foi possível gerar o PDF. Tente novamente.
            </span>
            <button
              type="button"
              onClick={handleGenerate}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-white hover:bg-red-50"
              style={{ borderColor: '#FECACA', color: '#B91C1C' }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {currentPdf && !generating && (
          <div
            role="status"
            className="flex items-center gap-3 px-3 py-2.5 mb-4 rounded-lg"
            style={{ backgroundColor: '#F0FDF4', color: '#166534' }}
          >
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">PDF pronto</div>
              <div className="text-xs truncate">
                {currentPdf.fileName} · {formatSize(currentPdf.sizeBytes)} ·{' '}
                {new Date(currentPdf.createdAt).toLocaleDateString('pt-BR')}
              </div>
            </div>
          </div>
        )}

        {actionError && (
          <div role="alert" className="flex items-center gap-2 px-3 py-2.5 mb-4 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#B91C1C' }}>
            <AlertCircle size={15} className="flex-shrink-0" /> {actionError}
          </div>
        )}
      </div>

      {/* Corpo: PDF real quando existe; texto oficial da versão enquanto não existe */}
      {currentPdf ? (
        <div className="rounded-xl border overflow-hidden bg-slate-100" style={BORDER}>
          {previewLoading && (
            <div className="flex items-center justify-center gap-2 h-64 text-sm text-slate-500" role="status">
              <Loader2 size={16} className="animate-spin" /> Carregando visualização...
            </div>
          )}
          {previewFailed && (
            <div className="flex flex-col items-center justify-center gap-1 h-48 px-4 text-center text-sm text-slate-500">
              <AlertCircle size={18} />
              Não foi possível carregar a visualização. Você ainda pode baixar o PDF.
            </div>
          )}
          {previewUrl && (
            <>
              <iframe
                src={previewUrl}
                title={`PDF do contrato #${contractNumber}, versão ${versionNumber}`}
                className="w-full block bg-white"
                style={{ height: '70vh', minHeight: '420px' }}
              />
              <p className="px-3 py-2 text-xs text-slate-500 bg-white border-t" style={BORDER}>
                Não aparece no seu dispositivo? Use “Abrir em nova aba” ou “Baixar PDF”.
              </p>
            </>
          )}
        </div>
      ) : versionNumber === null ? (
        <p className="text-sm text-center text-slate-400 py-8">Nenhuma versão gerada ainda.</p>
      ) : (
        <div>
          {!generating && !generateError && (
            <p className="text-sm text-slate-600 mb-3">
              Nenhum PDF gerado para esta versão. O documento textual está pronto para ser convertido em PDF.
            </p>
          )}
          <div className="rounded-xl border p-4 sm:p-6" style={{ ...BORDER, backgroundColor: '#FAFAFA' }}>
            <pre
              className="whitespace-pre-wrap break-words text-left max-w-2xl mx-auto"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.8', color: '#374151' }}
            >
              {content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
