import type { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { withRetry, type RetryOptions } from './retry';
import { assertSafeKey, buildStorageKey } from './storage-key';
import {
  StorageObjectNotFoundError,
  type StorageDriver,
  type StorageSaveInput,
  type StoredFile,
} from './storage.types';

export interface NeonS3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/** Erros TRANSITÓRIOS (vale tentar de novo). Tudo fora daqui — AccessDenied,
 * NoSuchKey, InvalidAccessKeyId, SignatureDoesNotMatch, NoSuchBucket… — falha na hora. */
const TRANSIENT_ERROR_NAMES = new Set([
  'SlowDown',
  'ServiceUnavailable',
  'InternalError',
  'RequestTimeout',
  'RequestTimeoutException',
  'ThrottlingException',
  'TooManyRequestsException',
  'TimeoutError',
]);
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN']);

interface AwsLikeError {
  name?: string;
  code?: string;
  $metadata?: { httpStatusCode?: number };
}

export function isTransientStorageError(error: unknown): boolean {
  const e = error as AwsLikeError | null;
  if (!e || typeof e !== 'object') return false;
  if (e.name && TRANSIENT_ERROR_NAMES.has(e.name)) return true;
  if (e.$metadata?.httpStatusCode && TRANSIENT_STATUS.has(e.$metadata.httpStatusCode)) return true;
  return Boolean(e.code && TRANSIENT_NETWORK_CODES.has(e.code));
}

function isNotFound(error: unknown): boolean {
  const e = error as AwsLikeError | null;
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

const DEFAULT_RETRY: Pick<RetryOptions, 'maxAttempts' | 'baseDelayMs' | 'maxDelayMs'> = {
  maxAttempts: 4, // 1 tentativa + 3 retries (~0,2s → 0,4s → 0,8s, com jitter)
  baseDelayMs: 200,
  maxDelayMs: 2000,
};

/**
 * Driver de produção: Neon Object Storage (S3-compatible), bucket PRIVADO.
 * O backend é o único que fala com o bucket — nunca há URL pública/pré-assinada.
 */
export class NeonS3StorageDriver implements StorageDriver {
  readonly name = 'neon-s3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly retry: Partial<RetryOptions>;

  constructor(config: NeonS3Config, options: { client?: S3Client; retry?: Partial<RetryOptions> } = {}) {
    this.bucket = config.bucket;
    this.retry = options.retry ?? {};
    this.client =
      options.client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle ?? true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        // O retry é nosso (política única e testável); evita multiplicar com o retry interno do SDK.
        maxAttempts: 1,
      });
  }

  private send<T>(operation: () => Promise<T>): Promise<T> {
    return withRetry(operation, { ...DEFAULT_RETRY, isRetryable: isTransientStorageError, ...this.retry });
  }

  async save(input: StorageSaveInput): Promise<StoredFile> {
    const key = input.key ?? buildStorageKey(input.officeId, input.fileName);
    assertSafeKey(key);

    await this.send(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.body.byteLength,
        }),
      ),
    );
    return { key, sizeBytes: input.body.byteLength };
  }

  async get(key: string): Promise<Readable> {
    assertSafeKey(key);
    try {
      const response = await this.send(() => this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })));
      if (!response.Body) throw new StorageObjectNotFoundError(key);
      // No Node, Body é um Readable: o arquivo é repassado por stream, sem virar Buffer.
      return response.Body as Readable;
    } catch (error) {
      if (isNotFound(error)) throw new StorageObjectNotFoundError(key);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.send(() => this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key);
    // DeleteObject é idempotente no S3: chave inexistente não gera erro.
    await this.send(() => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })));
  }
}
