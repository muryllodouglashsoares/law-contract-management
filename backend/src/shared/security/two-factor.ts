import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Primitivas de 2FA (TOTP, RFC 6238) usando somente `node:crypto` — sem dependências externas.
 *
 *  - TOTP: HMAC-SHA1, 6 dígitos, passo de 30 s (compatível com Google Authenticator, Authy, etc.).
 *  - Segredo em repouso: AES-256-GCM (formato `v1.<iv>.<tag>.<ciphertext>`, base64url).
 *  - Códigos de recuperação: aleatórios; só o HMAC-SHA256 (com chave do servidor) é armazenado.
 *  - Challenge de login: token HMAC curto (NÃO é um JWT e usa uma chave derivada diferente, então
 *    jamais é aceito por `request.jwtVerify()` nas rotas protegidas).
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1; // tolera ±1 passo (relógio levemente dessincronizado)
export const BACKUP_CODE_COUNT = 10;
export const CHALLENGE_TTL_SECONDS = 5 * 60;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Alfabeto dos códigos de recuperação: sem caracteres ambíguos (0/O, 1/I/L). */
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------------
// Base32 (RFC 4648)
// ---------------------------------------------------------------------

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Base32 inválido');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------

/** Segredo de 160 bits (recomendação do RFC 4226), em base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

export function hotp(secretBase32: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpAt(secretBase32: string, step: number): string {
  return hotp(secretBase32, step);
}

function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Valida um código TOTP na janela ±TOTP_WINDOW e devolve o passo que casou. Passos menores ou
 * iguais a `lastUsedStep` são rejeitados (replay do mesmo código).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: Date,
  lastUsedStep?: number | null,
): { valid: true; step: number } | { valid: false } {
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const current = totpStep(now);
  let matched: number | null = null;
  // Percorre a janela inteira sem retornar cedo (tempo de resposta independente do acerto).
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const step = current + offset;
    if (safeEqualStrings(totpAt(secretBase32, step), code) && matched === null) matched = step;
  }
  if (matched === null) return { valid: false };
  if (lastUsedStep !== null && lastUsedStep !== undefined && matched <= lastUsedStep) return { valid: false };
  return { valid: true, step: matched };
}

export function buildOtpauthUri(input: { secretBase32: string; accountName: string; issuer: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.accountName)}`;
  const params = new URLSearchParams({
    secret: input.secretBase32,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------------------------------------------------------------------
// Chaves e criptografia do segredo em repouso
// ---------------------------------------------------------------------

export interface TwoFactorKeyInput {
  encryptionKey: string | undefined;
  jwtSecret: string;
  nodeEnv: 'development' | 'test' | 'production';
}

/** Aceita 32 bytes em hexadecimal (64 chars) ou base64/base64url. Devolve null se inválida. */
export function parseEncryptionKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Chave mestra do 2FA. Em PRODUÇÃO só existe se TWO_FACTOR_ENCRYPTION_KEY estiver configurada
 * (sem ela o 2FA fica indisponível — nunca há chave "implícita" em produção). Em desenvolvimento
 * e testes, na ausência da variável, deriva uma chave do JWT_SECRET para facilitar o uso local.
 */
export function resolveTwoFactorMasterKey(input: TwoFactorKeyInput): Buffer | null {
  if (input.encryptionKey) return parseEncryptionKey(input.encryptionKey);
  if (input.nodeEnv === 'production') return null;
  return Buffer.from(hkdfSync('sha256', input.jwtSecret, 'lexcontract', 'dev-two-factor-master-key', 32));
}

function subKey(master: Buffer, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, 'lexcontract-2fa', label, 32));
}

export function encryptSecret(secret: string, masterKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subKey(masterKey, 'totp-secret'), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, masterKey: Buffer): string {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Formato de segredo inválido');
  const decipher = createDecipheriv('aes-256-gcm', subKey(masterKey, 'totp-secret'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------
// Códigos de recuperação
// ---------------------------------------------------------------------

function randomFromAlphabet(alphabet: string, length: number): string {
  let out = '';
  const limit = 256 - (256 % alphabet.length); // rejeição: evita viés de módulo
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

/** Formato exibido: `XXXXX-XXXXX` (50 bits de entropia). */
export function generateBackupCode(): string {
  const raw = randomFromAlphabet(BACKUP_ALPHABET, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateBackupCode());
  return [...codes];
}

export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function looksLikeBackupCode(input: string): boolean {
  return normalizeBackupCode(input).length === 10 && !/^\d{6}$/.test(input.trim());
}

export function hashBackupCode(code: string, masterKey: Buffer): string {
  return createHmac('sha256', subKey(masterKey, 'backup-code')).update(normalizeBackupCode(code)).digest('hex');
}

// ---------------------------------------------------------------------
// Challenge de login (estado intermediário entre senha e TOTP)
// ---------------------------------------------------------------------

export interface TwoFactorChallengePayload {
  /** Finalidade fixa: um challenge nunca serve como credencial de API. */
  purpose: '2fa-login';
  userId: string;
  officeId: string;
  /** Expiração, em segundos desde a época. */
  exp: number;
}

function challengeKey(jwtSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', jwtSecret, 'lexcontract', 'two-factor-login-challenge-v1', 32));
}

export function signLoginChallenge(
  input: { userId: string; officeId: string },
  jwtSecret: string,
  now: Date = new Date(),
  ttlSeconds: number = CHALLENGE_TTL_SECONDS,
): string {
  const payload: TwoFactorChallengePayload = {
    purpose: '2fa-login',
    userId: input.userId,
    officeId: input.officeId,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', challengeKey(jwtSecret)).update(`v1.${body}`).digest('base64url');
  return `${body}.${signature}`;
}

/** Valida assinatura, finalidade e expiração. Qualquer falha devolve null (sem detalhar o motivo). */
export function verifyLoginChallenge(
  token: string,
  jwtSecret: string,
  now: Date = new Date(),
): TwoFactorChallengePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  const expected = createHmac('sha256', challengeKey(jwtSecret)).update(`v1.${body}`).digest('base64url');
  if (!safeEqualStrings(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<TwoFactorChallengePayload>;
    if (
      payload.purpose !== '2fa-login' ||
      typeof payload.userId !== 'string' ||
      typeof payload.officeId !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp <= Math.floor(now.getTime() / 1000)) return null;
    return payload as TwoFactorChallengePayload;
  } catch {
    return null;
  }
}
