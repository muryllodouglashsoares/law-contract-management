import { describe, expect, it, vi } from 'vitest';

import { withRetry } from '../../src/shared/storage/retry';

const base = { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 };

describe('withRetry', () => {
  it('repete erros retentáveis com backoff crescente e devolve o sucesso', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const op = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue('ok');

    const result = await withRetry(op, { ...base, maxAttempts: 4, isRetryable: () => true, sleep });

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]); // dobra a cada tentativa
  });

  it('não passa de maxAttempts e lança o último erro', async () => {
    const op = vi.fn().mockRejectedValue(new Error('sempre falha'));
    await expect(withRetry(op, { ...base, maxAttempts: 3, isRetryable: () => true, sleep: async () => {} })).rejects.toThrow('sempre falha');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('não repete erros não retentáveis', async () => {
    const op = vi.fn().mockRejectedValue(new Error('permanente'));
    await expect(withRetry(op, { ...base, maxAttempts: 5, isRetryable: () => false, sleep: async () => {} })).rejects.toThrow('permanente');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('limita o atraso a maxDelayMs', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const op = vi.fn().mockRejectedValue(new Error('x'));
    await withRetry(op, { baseDelayMs: 1000, maxDelayMs: 1500, maxAttempts: 4, isRetryable: () => true, sleep, random: () => 1 }).catch(() => {});
    expect(Math.max(...sleep.mock.calls.map((c) => c[0]))).toBeLessThanOrEqual(1500);
  });
});
