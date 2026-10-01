import { sha256OfString } from './token';

/** Versão do texto de consentimento exibido ao signatário (registrada no aceite). */
export const CONSENT_TEXT_VERSION = 'v1-2026-10';

export const CONSENT_TEXT =
  'Declaro que li e concordo com o conteúdo deste contrato e realizo este aceite de forma consciente e voluntária.';

export interface SignatureHashInput {
  /** Identificador interno do registro de aceite (NUNCA o token bruto). */
  signatureId: string;
  contractId: string;
  contractVersionId: string;
  versionNumber: number;
  /** SHA-256 do conteúdo da versão aceita: amarra o aceite ao texto exato. */
  contentHash: string;
  signerName: string;
  signerDocument: string;
  signerIp: string | null;
  signedAt: Date;
  consentTextVersion: string;
}

/**
 * Impressão criptográfica do evento de aceite: SHA-256 de um JSON canônico
 * (chaves em ordem fixa, sem espaços). Permite conferir depois, a partir dos
 * campos gravados, que o registro não foi alterado. Não contém o token.
 */
export function canonicalSignaturePayload(input: SignatureHashInput): string {
  return JSON.stringify({
    v: 1,
    signatureId: input.signatureId,
    contractId: input.contractId,
    contractVersionId: input.contractVersionId,
    versionNumber: input.versionNumber,
    contentHash: input.contentHash,
    signerName: input.signerName,
    signerDocument: input.signerDocument,
    signerIp: input.signerIp,
    signedAt: input.signedAt.toISOString(),
    consentTextVersion: input.consentTextVersion,
  });
}

export function computeSignatureHash(input: SignatureHashInput): string {
  return sha256OfString(canonicalSignaturePayload(input));
}
