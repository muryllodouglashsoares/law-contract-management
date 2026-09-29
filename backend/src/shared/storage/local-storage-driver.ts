import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import { assertSafeKey, buildStorageKey } from './storage-key';
import {
  InvalidStorageKeyError,
  StorageObjectNotFoundError,
  type StorageDriver,
  type StorageSaveInput,
  type StoredFile,
} from './storage.types';

/**
 * Driver em disco — desenvolvimento e testes. NÃO usar em produção no Render
 * (filesystem efêmero). Layout: `{rootDir}/{officeId}/{uuid}.{ext}`, idêntico
 * ao que o storage antigo já gravava (as chaves antigas continuam válidas).
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolveKey(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new InvalidStorageKeyError('fora do diretório de storage');
    }
    return full;
  }

  async save(input: StorageSaveInput): Promise<StoredFile> {
    const key = input.key ?? buildStorageKey(input.officeId, input.fileName);
    const full = this.resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.body);
    return { key, sizeBytes: input.body.byteLength };
  }

  async get(key: string): Promise<Readable> {
    const full = this.resolveKey(key);
    if (!(await this.exists(key))) {
      throw new StorageObjectNotFoundError(key);
    }
    return createReadStream(full);
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolveKey(key))).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
