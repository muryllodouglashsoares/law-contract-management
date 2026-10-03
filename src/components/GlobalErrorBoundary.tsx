import type { ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/** Fallback exibido quando um erro de renderização derruba a árvore React. Usa só os tokens do tema. */
function ErrorFallback() {
  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8 text-center shadow-xl"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-foreground)' }}
        >
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-card-foreground)' }}>
          Algo deu errado
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)' }}>
          Ocorreu um erro inesperado ao exibir esta tela. Seus dados não foram perdidos. Recarregue a página para
          continuar; se o problema persistir, tente novamente em instantes.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-foreground)' }}
        >
          <RotateCw size={14} aria-hidden="true" /> Recarregar aplicação
        </button>
      </div>
    </div>
  );
}

/**
 * Error Boundary global. Usa o ErrorBoundary do Sentry: sem DSN o SDK não está
 * inicializado, então apenas exibe o fallback (nenhum envio). Com DSN, reporta o erro.
 */
export default function GlobalErrorBoundary({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={<ErrorFallback />}>{children}</Sentry.ErrorBoundary>;
}
