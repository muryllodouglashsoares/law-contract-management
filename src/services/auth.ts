import { apiClient } from '../lib/api-client';
import type { LoginResponse, TwoFactorStatus, User } from '../types/api';

/** Autenticação e 2FA. O segredo TOTP só aparece na resposta do setup (uma vez) e nunca é guardado no frontend. */
export const authService = {
  login: (email: string, password: string) => apiClient.post<LoginResponse>('/auth/login', { email, password }),
  /** 2ª etapa do login: o challenge NÃO é um JWT e só vale para esta chamada. */
  verifyTwoFactorLogin: (challengeToken: string, code: string) =>
    apiClient.anonymous.post<{ accessToken: string; user: User }>('/auth/2fa/verify-login', { challengeToken, code }),

  twoFactorStatus: () => apiClient.get<TwoFactorStatus>('/auth/2fa/status'),
  twoFactorSetup: () => apiClient.post<{ secret: string; otpauthUri: string }>('/auth/2fa/setup'),
  twoFactorVerifySetup: (code: string) => apiClient.post<{ backupCodes: string[] }>('/auth/2fa/verify-setup', { code }),
  twoFactorDisable: (input: { password: string; code: string }) => apiClient.post<void>('/auth/2fa/disable', input),
};
