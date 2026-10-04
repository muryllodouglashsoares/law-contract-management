import { checkDocument, type DocumentCheck } from './br-document';

/** Mesmo mínimo do backend (signContractBodySchema: nome com pelo menos 3 caracteres). */
export const SIGNER_NAME_MIN_LENGTH = 3;

export interface SignatureFormInput {
  signerName: string;
  /** Texto do campo, com ou sem máscara. */
  signerDocument: string;
  consent: boolean;
}

export interface SignatureFormState {
  nameValid: boolean;
  document: DocumentCheck;
  consent: boolean;
  /** Nome válido + CPF/CNPJ válido + consentimento marcado. */
  canSubmit: boolean;
}

export function evaluateSignatureForm(input: SignatureFormInput): SignatureFormState {
  const nameValid = input.signerName.trim().length >= SIGNER_NAME_MIN_LENGTH;
  const document = checkDocument(input.signerDocument);
  return {
    nameValid,
    document,
    consent: input.consent,
    canSubmit: nameValid && document.valid && input.consent,
  };
}

/**
 * Corpo enviado ao backend: o documento vai SOMENTE com dígitos (sem pontuação).
 * Retorna null se o formulário ainda não pode ser enviado.
 */
export function buildSignPayload(input: SignatureFormInput): { signerName: string; signerDocument: string; consent: true } | null {
  const state = evaluateSignatureForm(input);
  if (!state.canSubmit) return null;
  return { signerName: input.signerName.trim(), signerDocument: state.document.digits, consent: true };
}
