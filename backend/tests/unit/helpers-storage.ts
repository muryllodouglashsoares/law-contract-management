import { Readable } from 'node:stream';

import type { StorageDriver, StorageSaveInput, StoredFile } from '../../src/shared/storage/storage.types';
import { StorageObjectNotFoundError } from '../../src/shared/storage/storage.types';
import { buildStorageKey } from '../../src/shared/storage/storage-key';

/** Driver em memória para testar services sem disco nem rede. */
export class MemoryStorage implements StorageDriver {
  readonly name = 'local' as const;
  readonly objects = new Map<string, Buffer>();
  failSave: Error | null = null;
  failRemove: Error | null = null;

  async save(input: StorageSaveInput): Promise<StoredFile> {
    if (this.failSave) throw this.failSave;
    const key = input.key ?? buildStorageKey(input.officeId, input.fileName);
    this.objects.set(key, input.body);
    return { key, sizeBytes: input.body.byteLength };
  }
  async get(key: string) {
    const body = this.objects.get(key);
    if (!body) throw new StorageObjectNotFoundError(key);
    return Readable.from([body]);
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
  async remove(key: string) {
    if (this.failRemove) throw this.failRemove;
    this.objects.delete(key);
  }
}

export async function streamToBuffer(stream: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

/** Arquivos mínimos com assinatura válida para cada formato. */
export const SAMPLE_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
export const SAMPLE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
