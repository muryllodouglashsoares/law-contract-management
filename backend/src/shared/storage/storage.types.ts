import type { Readable } from 'node:stream';

export interface StorageSaveInput {
  /** Escritório dono do arquivo; vira o primeiro segmento da chave. Sempre vem da sessão autenticada. */
  officeId: string;
  /** Nome original: só é usado para derivar uma extensão segura. Nunca vira parte da chave. */
  fileName: string;
  contentType: string;
  body: Buffer;
  /**
   * Chave explícita. Uso EXCLUSIVO do script de migração (preservar chaves antigas).
   * O fluxo normal deixa o driver gerar `{officeId}/{uuid}.{ext}`.
   */
  key?: string;
}

export interface StoredFile {
  /** Chave do objeto — é o que fica gravado em `Document.storagePath`. */
  key: string;
  sizeBytes: number;
}

/**
 * Contrato de armazenamento de documentos, independente de provedor.
 * DocumentService/ContractService só conhecem esta interface.
 */
export interface StorageDriver {
  readonly name: 'local' | 'neon-s3';
  save(input: StorageSaveInput): Promise<StoredFile>;
  /** Stream do conteúdo. Lança StorageObjectNotFoundError se a chave não existir. */
  get(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  /** Idempotente: remover uma chave inexistente não é erro. */
  remove(key: string): Promise<void>;
}

export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Objeto não encontrado no storage: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}

export class InvalidStorageKeyError extends Error {
  constructor(reason: string) {
    super(`Chave de storage inválida: ${reason}`);
    this.name = 'InvalidStorageKeyError';
  }
}
