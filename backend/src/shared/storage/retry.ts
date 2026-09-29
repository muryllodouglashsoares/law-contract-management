export interface RetryOptions {
  /** Total de tentativas (1 = sem retry). */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable: (error: unknown) => boolean;
  /** Injetável para testes. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry com backoff exponencial + jitter. Limitado (nunca infinito): esgotadas
 * as tentativas, lança o ÚLTIMO erro. Erros não retentáveis são lançados na hora.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.maxAttempts || !options.isRetryable(error)) {
        throw error;
      }
      const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(exponential / 2 + random() * (exponential / 2)); // "equal jitter"
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
