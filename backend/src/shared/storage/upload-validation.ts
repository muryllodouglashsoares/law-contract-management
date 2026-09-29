import path from 'node:path';

import { ValidationError } from '../errors';

/**
 * Validação de uploads: MIME declarado + extensão + assinatura real (magic bytes)
 * + tamanho. O MIME enviado pelo cliente sozinho não vale nada — `virus.exe`
 * renomeado para `.pdf` com `Content-Type: application/pdf` é barrado pela assinatura.
 */

interface AllowedType {
  mime: string;
  extensions: string[];
  /** Rótulo curto exibido na lista de documentos. */
  label: string;
  matchesSignature: (buffer: Buffer) => boolean;
}

const startsWith = (buffer: Buffer, bytes: number[]) => bytes.every((byte, i) => buffer[i] === byte);
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc / .xls legados
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** .docx/.xlsx são ZIPs: além do "PK", exige as entradas típicas do formato. */
const isOfficeOpenXml = (buffer: Buffer, folder: 'word/' | 'xl/') =>
  startsWith(buffer, ZIP_MAGIC) && buffer.includes('[Content_Types].xml') && buffer.includes(folder);

export const ALLOWED_UPLOAD_TYPES: AllowedType[] = [
  { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF', matchesSignature: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { mime: 'image/png', extensions: ['png'], label: 'PNG', matchesSignature: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPG', matchesSignature: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { mime: 'application/msword', extensions: ['doc'], label: 'DOC', matchesSignature: (b) => startsWith(b, OLE_MAGIC) },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    label: 'DOCX',
    matchesSignature: (b) => isOfficeOpenXml(b, 'word/'),
  },
  { mime: 'application/vnd.ms-excel', extensions: ['xls'], label: 'XLS', matchesSignature: (b) => startsWith(b, OLE_MAGIC) },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    label: 'XLSX',
    matchesSignature: (b) => isOfficeOpenXml(b, 'xl/'),
  },
  // Texto puro não tem assinatura: aceitamos se não houver bytes NUL (sinal de binário).
  { mime: 'text/plain', extensions: ['txt'], label: 'TXT', matchesSignature: (b) => !b.subarray(0, 8192).includes(0) },
];

/** MIMEs "genéricos" que navegadores mandam quando não reconhecem o arquivo. */
const GENERIC_MIMES = new Set(['', 'application/octet-stream']);

export const ALLOWED_UPLOAD_EXTENSIONS_LABEL = ALLOWED_UPLOAD_TYPES.map((t) => t.label).join(', ');

export interface ValidatedUpload {
  /** Nome sem diretórios/caracteres de controle (nome de exibição — nunca usado como chave). */
  fileName: string;
  /** MIME canônico (o real), não o declarado pelo cliente. */
  mimeType: string;
  fileType: string;
}

/** Remove qualquer caminho, caracteres de controle e limita o tamanho do nome. */
export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(-200);
}

export function validateUpload(
  input: { fileName: string; declaredMimeType: string; buffer: Buffer },
  options: { maxBytes: number },
): ValidatedUpload {
  const fileName = sanitizeFileName(input.fileName);
  if (!fileName) {
    throw new ValidationError('Nome do arquivo é obrigatório');
  }
  if (input.buffer.byteLength === 0) {
    throw new ValidationError('O arquivo enviado está vazio');
  }
  if (input.buffer.byteLength > options.maxBytes) {
    throw new ValidationError('Arquivo excede o tamanho máximo permitido');
  }

  const extension = path.extname(fileName).replace('.', '').toLowerCase();
  const type = ALLOWED_UPLOAD_TYPES.find((t) => t.extensions.includes(extension));
  if (!type) {
    throw new ValidationError(`Tipo de arquivo não permitido. Formatos aceitos: ${ALLOWED_UPLOAD_EXTENSIONS_LABEL}`);
  }

  const declared = (input.declaredMimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (!GENERIC_MIMES.has(declared) && declared !== type.mime) {
    throw new ValidationError('O tipo informado do arquivo não corresponde à sua extensão');
  }

  if (!type.matchesSignature(input.buffer)) {
    throw new ValidationError('O conteúdo do arquivo não corresponde ao formato informado');
  }

  return { fileName, mimeType: type.mime, fileType: type.label };
}
