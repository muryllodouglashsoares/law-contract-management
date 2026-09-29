import { describe, expect, it } from 'vitest';

import { generateTemporaryPassword } from '../../src/shared/auth/temporary-password';

describe('generateTemporaryPassword', () => {
  it('gera 16 caracteres com maiúscula, minúscula, dígito e símbolo', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%&*?_-]/);
    }
  });

  it('não usa caracteres ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('gera valores diferentes a cada chamada', () => {
    const passwords = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(passwords.size).toBe(500);
  });

  it('atende à validação de senha existente (mínimo de 8 caracteres)', () => {
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(8);
  });
});
