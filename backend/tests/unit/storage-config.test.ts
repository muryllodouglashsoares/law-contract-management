import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStorageDriver } from '../../src/shared/storage';

const s3 = {
  STORAGE_DRIVER: 'neon-s3' as const,
  UPLOADS_DIR: './uploads-test',
  S3_ENDPOINT: 'https://s3.example.test',
  S3_REGION: 'us-east-2',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'your-key',
  S3_SECRET_ACCESS_KEY: 'your-secret',
};

describe('createStorageDriver', () => {
  it('local → LocalStorageDriver', () => {
    expect(createStorageDriver({ STORAGE_DRIVER: 'local', UPLOADS_DIR: './uploads-test' }).name).toBe('local');
  });

  it('neon-s3 → NeonS3StorageDriver', () => {
    expect(createStorageDriver(s3).name).toBe('neon-s3');
  });

  it('neon-s3 sem credencial falha com mensagem clara', () => {
    expect(() => createStorageDriver({ ...s3, S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
  });
});

describe('env: STORAGE_DRIVER', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function loadEnv(vars: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    return import('../../src/config/env');
  }

  it('aceita local sem nenhuma credencial S3', async () => {
    const { env } = await loadEnv({ STORAGE_DRIVER: 'local' });
    expect(env.STORAGE_DRIVER).toBe('local');
  });

  it('neon-s3 completo é aceito; S3_FORCE_PATH_STYLE assume true', async () => {
    const { env } = await loadEnv({
      STORAGE_DRIVER: 'neon-s3',
      S3_ENDPOINT: 'https://s3.example.test',
      S3_REGION: 'us-east-2',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'your-key',
      S3_SECRET_ACCESS_KEY: 'your-secret',
    });
    expect(env.STORAGE_DRIVER).toBe('neon-s3');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('neon-s3 sem credenciais derruba a inicialização listando o que falta', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loadEnv({ STORAGE_DRIVER: 'neon-s3', S3_ENDPOINT: '', S3_BUCKET: '' })).rejects.toThrow('process.exit');

    expect(exit).toHaveBeenCalledWith(1);
    const output = errors.mock.calls.flat().join('\n');
    for (const name of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      expect(output).toContain(name);
    }
  });

  it('rejeita valor de STORAGE_DRIVER desconhecido', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(loadEnv({ STORAGE_DRIVER: 's3-publico' })).rejects.toThrow('process.exit');
  });
});
