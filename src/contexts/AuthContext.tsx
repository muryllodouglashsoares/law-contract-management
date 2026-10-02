import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { ApiError, apiClient, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../lib/api-client';
import { detachPushOnLogout } from '../lib/push-client';
import type { Office, User } from '../types/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  office: Office | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Recarrega usuário/escritório (ex.: depois de editar o perfil em Configurações). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL_STATE: AuthState = { status: 'loading', user: null, office: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  const loadSession = useCallback(async () => {
    try {
      const [{ user }, { office }] = await Promise.all([
        apiClient.get<{ user: User }>('/auth/me'),
        apiClient.get<{ office: Office }>('/offices/me'),
      ]);
      setState({ status: 'authenticated', user, office });
    } catch {
      setStoredToken(null);
      setState({ status: 'unauthenticated', user: null, office: null });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStoredToken(null);
      setState({ status: 'unauthenticated', user: null, office: null });
    });

    if (getStoredToken()) {
      void loadSession();
    } else {
      setState({ status: 'unauthenticated', user: null, office: null });
    }

    return () => setUnauthorizedHandler(null);
  }, [loadSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const response = await apiClient.post<{ accessToken: string }>('/auth/login', { email, password });
        setStoredToken(response.accessToken);
        await loadSession();
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          throw new Error('E-mail ou senha incorretos.');
        }
        throw error;
      }
    },
    [loadSession],
  );

  const logout = useCallback(() => {
    // Antes de apagar o token: tira este dispositivo do Web Push de quem está saindo.
    detachPushOnLogout();
    setStoredToken(null);
    setState({ status: 'unauthenticated', user: null, office: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refresh: loadSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>');
  }
  return context;
}
