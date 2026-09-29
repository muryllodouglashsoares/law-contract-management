import { env } from '../../config/env';
import { LocalStorageDriver } from './local-storage-driver';
import { NeonS3StorageDriver } from './neon-s3-storage-driver';
import type { StorageDriver } from './storage.types';

export type { StorageDriver, StorageSaveInput, StoredFile } from './storage.types';
export { StorageObjectNotFoundError } from './storage.types';

export interface StorageConfig {
  STORAGE_DRIVER: 'local' | 'neon-s3';
  UPLOADS_DIR: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE?: boolean;
}

/** Cria o driver escolhido. Recebe a config por parâmetro (testável sem mexer em process.env). */
export function createStorageDriver(config: StorageConfig): StorageDriver {
  if (config.STORAGE_DRIVER === 'local') {
    return new LocalStorageDriver(config.UPLOADS_DIR);
  }

  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = config;
  if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('STORAGE_DRIVER=neon-s3 exige S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY');
  }
  return new NeonS3StorageDriver({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  });
}

let instance: StorageDriver | undefined;

/** Driver da aplicação (singleton, criado sob demanda a partir do env validado). */
export function getStorage(): StorageDriver {
  instance ??= createStorageDriver(env);
  return instance;
}

/**
 * Remove um objeto sem mascarar o erro original de quem chamou: se a remoção
 * falhar, só registra (o objeto órfão fica identificado pela chave no log).
 */
export async function removeQuietly(storage: StorageDriver, key: string, context: string): Promise<void> {
  try {
    await storage.remove(key);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: 'error', msg: 'Falha ao remover objeto do storage', context, key, err: String(error) }));
  }
}
