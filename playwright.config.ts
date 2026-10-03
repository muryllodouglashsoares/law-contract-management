import { defineConfig, devices } from '@playwright/test'

/**
 * E2E do LexContract — somente Chromium.
 *
 * Os servidores NÃO são iniciados por aqui: o backend (E2E_API_URL, padrão http://localhost:3333)
 * e o frontend buildado com VITE_API_URL apontando para ele (E2E_BASE_URL, padrão
 * http://localhost:4173) devem estar de pé, com o banco migrado e semeado.
 * Passo a passo no README.md (seção "Testes E2E").
 */
export default defineConfig({
  testDir: './e2e',
  // Cada teste cria seus próprios dados (nomes únicos) e não depende dos demais.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
