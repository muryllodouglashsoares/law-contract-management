import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalStorageDriver } from '../../src/shared/storage/local-storage-driver';
import { StorageObjectNotFoundError } from '../../src/shared/storage/storage.types';
import { streamToBuffer } from './helpers-storage';

const OFFICE = 'office-123';

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'lex-storage-'));
    driver = new LocalStorageDriver(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('save grava em {officeId}/{uuid}.{ext} e devolve chave e tamanho', async () => {
    const saved = await driver.save({ officeId: OFFICE, fileName: 'x.pdf', contentType: 'application/pdf', body: Buffer.from('abc') });

    expect(saved.key).toMatch(/^office-123\/[0-9a-f-]{36}\.pdf$/);
    expect(saved.sizeBytes).toBe(3);
    expect(await readdir(path.join(root, OFFICE))).toHaveLength(1);
  });

  it('get devolve o conteúdo por stream', async () => {
    const { key } = await driver.save({ officeId: OFFICE, fileName: 'x.pdf', contentType: 'application/pdf', body: Buffer.from('conteúdo') });
    expect((await streamToBuffer(await driver.get(key))).toString()).toBe('conteúdo');
  });

  it('get de chave inexistente lança StorageObjectNotFoundError', async () => {
    await expect(driver.get(`${OFFICE}/nao-existe.pdf`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('exists reflete a presença do arquivo', async () => {
    const { key } = await driver.save({ officeId: OFFICE, fileName: 'x.pdf', contentType: 'application/pdf', body: Buffer.from('a') });
    expect(await driver.exists(key)).toBe(true);
    expect(await driver.exists(`${OFFICE}/outro.pdf`)).toBe(false);
  });

  it('remove apaga o arquivo e é idempotente', async () => {
    const { key } = await driver.save({ officeId: OFFICE, fileName: 'x.pdf', contentType: 'application/pdf', body: Buffer.from('a') });
    await driver.remove(key);
    expect(await driver.exists(key)).toBe(false);
    await expect(driver.remove(key)).resolves.toBeUndefined();
  });

  it('não permite sair do diretório raiz (path traversal)', async () => {
    await expect(driver.get('../../etc/passwd')).rejects.toThrow(/inválida/);
    await expect(driver.remove(`${OFFICE}/../../x.pdf`)).rejects.toThrow(/inválida/);
    await expect(
      driver.save({ officeId: OFFICE, fileName: 'x.pdf', contentType: 'application/pdf', body: Buffer.from('a'), key: '../fora.pdf' }),
    ).rejects.toThrow(/inválida/);
  });
});
