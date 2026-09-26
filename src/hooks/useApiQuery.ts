import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../lib/api-client';

interface UseApiQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook genérico para chamadas de leitura (GET): concentra o boilerplate de
 * loading/error/refetch usado por praticamente toda página que consome a
 * API, para que cada página não precise reimplementar o mesmo padrão.
 *
 * `deps` funciona como no `useEffect`: a requisição é refeita quando algum
 * valor da lista muda (ex.: página atual, filtro de busca).
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): UseApiQueryState<T> & { refetch: () => void } {
  const [state, setState] = useState<UseApiQueryState<T>>({ data: null, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os dados. Tente novamente.';
        setState({ data: null, loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
    // deps controla deliberadamente quando a busca é refeita (mesmo espírito de useEffect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { ...state, refetch };
}

/** Extrai uma mensagem de erro amigável de qualquer erro capturado
 * (usado em handlers de mutação: criar/editar/excluir). */
export function toErrorMessage(error: unknown, fallback = 'Ocorreu um erro. Tente novamente.'): string {
  return error instanceof ApiError ? error.message : fallback;
}
