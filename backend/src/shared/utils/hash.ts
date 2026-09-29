import { createHash } from 'node:crypto';

/** SHA-256 em hexadecimal minúsculo (64 caracteres). */
export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
