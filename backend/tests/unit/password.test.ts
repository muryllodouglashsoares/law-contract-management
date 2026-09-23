import { describe, expect, it } from 'vitest';

import { comparePassword, hashPassword } from '../../src/shared/auth/password';

describe('password hashing', () => {
  it('nunca armazena a senha em texto puro', async () => {
    const plain = 'MinhaSenh@Forte123';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash.length).toBeGreaterThan(20);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const plain = 'MinhaSenh@Forte123';
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1).not.toBe(hash2);
  });

  it('valida corretamente a senha certa', async () => {
    const plain = 'MinhaSenh@Forte123';
    const hash = await hashPassword(plain);

    await expect(comparePassword(plain, hash)).resolves.toBe(true);
  });

  it('rejeita uma senha incorreta', async () => {
    const hash = await hashPassword('MinhaSenh@Forte123');

    await expect(comparePassword('senha-errada', hash)).resolves.toBe(false);
  });
});
