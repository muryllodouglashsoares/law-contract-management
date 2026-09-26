import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env';

/**
 * Armazenamento local de arquivos em disco, usado em desenvolvimento.
 *
 * Isolado atrás desta interface simples (save/remove/absolutePath) para que
 * trocar para um object storage real (S3, GCS, etc.) em produção não exija
 * alterar nenhum service — apenas trocar esta implementação por uma que
 * fale com o SDK do provedor, mantendo a mesma assinatura.
 */
const UPLOADS_ROOT = env.UPLOADS_DIR;

export interface SavedFile {
  storagePath: string;
  sizeBytes: number;
}

export async function saveFile(officeId: string, originalFileName: string, buffer: Buffer): Promise<SavedFile> {
  const officeDir = path.join(UPLOADS_ROOT, officeId);
  await mkdir(officeDir, { recursive: true });

  const extension = path.extname(originalFileName);
  const storedName = `${randomUUID()}${extension}`;
  const storagePath = path.join(officeId, storedName);

  await writeFile(path.join(UPLOADS_ROOT, storagePath), buffer);

  return { storagePath, sizeBytes: buffer.byteLength };
}

export function absolutePath(storagePath: string): string {
  return path.join(UPLOADS_ROOT, storagePath);
}

export async function removeFile(storagePath: string): Promise<void> {
  await unlink(absolutePath(storagePath)).catch(() => undefined);
}
