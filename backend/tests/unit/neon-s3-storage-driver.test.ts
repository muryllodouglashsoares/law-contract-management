import { Readable } from 'node:stream';

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { isTransientStorageError, NeonS3StorageDriver } from '../../src/shared/storage/neon-s3-storage-driver';
import { StorageObjectNotFoundError } from '../../src/shared/storage/storage.types';
import { streamToBuffer } from './helpers-storage';

const OFFICE = 'office-123';
const config = { endpoint: 'https://s3.example.test', region: 'us-east-2', bucket: 'lex-bucket', accessKeyId: 'k', secretAccessKey: 's' };

function awsError(name: string, status: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
}

function setup(send: ReturnType<typeof vi.fn>) {
  const client = { send } as unknown as S3Client;
  const driver = new NeonS3StorageDriver(config, { client, retry: { sleep: async () => {}, maxAttempts: 3 } });
  return { driver, send };
}

describe('NeonS3StorageDriver', () => {
  it('save envia PutObject com bucket, chave {officeId}/{uuid}.{ext}, tipo e tamanho', async () => {
    const { driver, send } = setup(vi.fn().mockResolvedValue({}));

    const saved = await driver.save({ officeId: OFFICE, fileName: 'Contrato.PDF', contentType: 'application/pdf', body: Buffer.from('abc') });

    expect(saved.key).toMatch(/^office-123\/[0-9a-f-]{36}\.pdf$/);
    expect(saved.sizeBytes).toBe(3);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'lex-bucket', Key: saved.key, ContentType: 'application/pdf', ContentLength: 3 });
  });

  it('get devolve o Body como stream (GetObject)', async () => {
    const { driver, send } = setup(vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('conteúdo')]) }));

    const stream = await driver.get(`${OFFICE}/abc.pdf`);

    expect((await streamToBuffer(stream)).toString()).toBe('conteúdo');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect((send.mock.calls[0]?.[0] as GetObjectCommand).input).toMatchObject({ Bucket: 'lex-bucket', Key: `${OFFICE}/abc.pdf` });
  });

  it('get converte NoSuchKey em StorageObjectNotFoundError, sem retry', async () => {
    const { driver, send } = setup(vi.fn().mockRejectedValue(awsError('NoSuchKey', 404)));
    await expect(driver.get(`${OFFICE}/abc.pdf`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('remove envia DeleteObject', async () => {
    const { driver, send } = setup(vi.fn().mockResolvedValue({}));
    await driver.remove(`${OFFICE}/abc.pdf`);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('exists usa HeadObject: true quando existe, false em 404', async () => {
    const found = setup(vi.fn().mockResolvedValue({}));
    expect(await found.driver.exists(`${OFFICE}/a.pdf`)).toBe(true);
    expect(found.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);

    const missing = setup(vi.fn().mockRejectedValue(awsError('NotFound', 404)));
    expect(await missing.driver.exists(`${OFFICE}/a.pdf`)).toBe(false);
  });

  describe('retry', () => {
    it('503 SlowDown é repetido e a operação termina com sucesso', async () => {
      const send = vi.fn().mockRejectedValueOnce(awsError('SlowDown', 503)).mockRejectedValueOnce(awsError('SlowDown', 503)).mockResolvedValue({});
      const { driver } = setup(send);

      const saved = await driver.save({ officeId: OFFICE, fileName: 'a.pdf', contentType: 'application/pdf', body: Buffer.from('x') });

      expect(saved.sizeBytes).toBe(1);
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('SlowDown persistente para no limite de tentativas e lança o erro', async () => {
      const { driver, send } = setup(vi.fn().mockRejectedValue(awsError('SlowDown', 503)));
      await expect(
        driver.save({ officeId: OFFICE, fileName: 'a.pdf', contentType: 'application/pdf', body: Buffer.from('x') }),
      ).rejects.toMatchObject({ name: 'SlowDown' });
      expect(send).toHaveBeenCalledTimes(3);
    });

    it.each([
      ['AccessDenied', 403],
      ['InvalidAccessKeyId', 403],
      ['SignatureDoesNotMatch', 403],
      ['NoSuchBucket', 404],
    ])('erro permanente %s não é repetido', async (name, status) => {
      const { driver, send } = setup(vi.fn().mockRejectedValue(awsError(name, status)));
      await expect(
        driver.save({ officeId: OFFICE, fileName: 'a.pdf', contentType: 'application/pdf', body: Buffer.from('x') }),
      ).rejects.toMatchObject({ name });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('classifica erros transitórios vs permanentes', () => {
      expect(isTransientStorageError(awsError('SlowDown', 503))).toBe(true);
      expect(isTransientStorageError(awsError('Whatever', 500))).toBe(true);
      expect(isTransientStorageError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
      expect(isTransientStorageError(awsError('AccessDenied', 403))).toBe(false);
      expect(isTransientStorageError(awsError('NoSuchKey', 404))).toBe(false);
      expect(isTransientStorageError(null)).toBe(false);
    });
  });

  it('recusa chaves fora do formato antes de falar com o bucket', async () => {
    const { driver, send } = setup(vi.fn());
    await expect(driver.get('../../outro/segredo')).rejects.toThrow(/inválida/);
    await expect(driver.remove(`${OFFICE}/../x.pdf`)).rejects.toThrow(/inválida/);
    expect(send).not.toHaveBeenCalled();
  });
});
