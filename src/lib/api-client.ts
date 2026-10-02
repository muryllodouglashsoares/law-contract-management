/**
 * Cliente HTTP central do frontend — todo acesso à API do backend passa por
 * aqui (nunca `fetch` espalhado pelas páginas). Ver estrutura conceitual no
 * plano de integração: pages -> hooks/services -> api client -> backend.
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3333';
const TOKEN_STORAGE_KEY = 'lexcontract:token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export interface ApiFieldIssue {
  path: string;
  message: string;
}

/** Erro lançado para qualquer resposta HTTP não-2xx. `status` permite às
 * páginas tratar casos específicos (ex.: 409 de conflito) sem depender de
 * comparar a mensagem em texto. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: ApiFieldIssue[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Chamado sempre que a API responde 401 (token ausente/expirado/inválido).
 * Configurado pelo AuthContext para acionar o logout automático. */
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export interface QueryParams {
  [key: string]: string | number | boolean | undefined | null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  /** false = rota pública: não envia o JWT e um 401 NÃO dispara o logout automático. */
  auth?: boolean;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(path.replace(/^\//, ''), API_URL.endsWith('/') ? API_URL : `${API_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const useAuth = options.auth !== false;
  const token = useAuth ? getStoredToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.');
  }

  if (response.status === 401 && useAuth) {
    unauthorizedHandler?.();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = data?.error?.message ?? 'Ocorreu um erro inesperado. Tente novamente.';
    throw new ApiError(response.status, message, data?.error?.code, data?.error?.details);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string, query?: QueryParams) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),

  /** Rotas públicas (sem JWT), ex.: página de aceite eletrônico por link. */
  anonymous: {
    get: <T>(path: string) => request<T>(path, { method: 'GET', auth: false }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: false }),
  },

  /** Upload multipart (ex.: envio de documento). */
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),

  /** Download de arquivo binário (ex.: documento anexado a um contrato). */
  async downloadBlob(path: string): Promise<{ blob: Blob; fileName: string | null }> {
    const headers: Record<string, string> = {};
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(buildUrl(path), { headers });
    } catch {
      throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.');
    }

    if (response.status === 401) {
      unauthorizedHandler?.();
    }

    if (!response.ok) {
      // Preserva status e mensagem reais da API (ex.: 404 "Arquivo não encontrado no armazenamento").
      const data = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        data?.error?.message ?? 'Não foi possível baixar o arquivo.',
        data?.error?.code,
      );
    }

    const disposition = response.headers.get('content-disposition');
    const match = disposition?.match(/filename="?([^"]+)"?/);
    const fileName = match?.[1] ? decodeURIComponent(match[1]) : null;

    return { blob: await response.blob(), fileName };
  },
};

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
