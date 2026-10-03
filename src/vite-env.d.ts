/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Opcional. Sem valor, o Sentry fica desativado. */
  readonly VITE_SENTRY_DSN?: string
}
