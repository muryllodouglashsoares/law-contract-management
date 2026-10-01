import { apiClient } from '../lib/api-client';
import type { PublicSignatureResult, PublicSignatureView } from '../types/api';

export interface SignContractInput {
  signerName: string;
  signerDocument: string;
  consent: true;
}

/** Endpoints PÚBLICOS (sem JWT). A validade do token é decidida exclusivamente pelo backend. */
export const publicSignaturesService = {
  get: (token: string) => apiClient.anonymous.get<PublicSignatureView>(`/public/signatures/${encodeURIComponent(token)}`),
  sign: (token: string, input: SignContractInput) =>
    apiClient.anonymous.post<PublicSignatureResult>(`/public/signatures/${encodeURIComponent(token)}/sign`, input),
};
