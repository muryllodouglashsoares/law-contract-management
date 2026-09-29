import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { InvalidStorageKeyError } from './storage.types';

const OFFICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// `{officeId}/{nome}[.ext]` — exatamente dois segmentos, sem `..`, barras extras ou caracteres de controle.
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}(\.[A-Za-z0-9]{1,16})?$/;
const SAFE_EXTENSION = /^\.[a-z0-9]{1,10}$/;

/** Extensão em minúsculas, só se for alfanumérica e curta; caso contrário, nenhuma. */
export function safeExtension(fileName: string): string {
  const ext = path.extname(path.basename(fileName.replace(/\\/g, '/'))).toLowerCase();
  return SAFE_EXTENSION.test(ext) ? ext : '';
}

/** Chave `{officeId}/{uuid}.{ext}`. O nome enviado pelo usuário nunca entra na chave (só a extensão sanitizada). */
export function buildStorageKey(officeId: string, fileName: string): string {
  if (!OFFICE_ID_PATTERN.test(officeId)) {
    throw new InvalidStorageKeyError('officeId inválido');
  }
  return `${officeId}/${randomUUID()}${safeExtension(fileName)}`;
}

/** Barreira contra path traversal: todo driver valida a chave antes de tocar disco/bucket. */
export function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new InvalidStorageKeyError('formato inesperado');
  }
}

/** A chave pertence ao escritório? (defesa em profundidade além do `where: { officeId }` do banco) */
export function keyBelongsToOffice(key: string, officeId: string): boolean {
  return key.startsWith(`${officeId}/`);
}
