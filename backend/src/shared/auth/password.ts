import bcrypt from 'bcryptjs';

/**
 * Custo do bcrypt (número de rounds). 12 é um valor seguro e amplamente
 * recomendado atualmente, equilibrando segurança e tempo de resposta.
 */
const SALT_ROUNDS = 12;

/** Gera o hash seguro de uma senha em texto puro. Nunca armazene a senha original. */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/** Compara uma senha em texto puro com um hash previamente armazenado. */
export async function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
