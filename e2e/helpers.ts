import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** Usuários criados por `npm run db:seed` (backend). Nenhum deles exige troca de senha. */
export const USERS = {
  admin: { email: 'muryllo@escritorio.com.br', name: 'Muryllo Rocha' },
  lawyer: { email: 'advogado@escritorio.com.br', name: 'Ana Paula Ferreira' },
} as const

/**
 * Senha dos usuários do seed: a MESMA que o backend recebeu em `SEED_PASSWORD` ao rodar
 * `npm run db:seed` (não existe senha fixa no código). `E2E_SEED_PASSWORD` tem prioridade
 * se você precisar de um valor diferente do `SEED_PASSWORD` do shell.
 */
function readSeedPassword(): string {
  const value = process.env.E2E_SEED_PASSWORD ?? process.env.SEED_PASSWORD
  if (!value) {
    throw new Error(
      'Defina SEED_PASSWORD (ou E2E_SEED_PASSWORD) com a mesma senha usada em `npm run db:seed` para rodar os testes E2E.',
    )
  }
  return value
}
export const SEED_PASSWORD = readSeedPassword()

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3333').replace(/\/+$/, '')
// Mesma chave usada por src/lib/api-client.ts.
const TOKEN_STORAGE_KEY = 'lexcontract:token'

/** Identificador curto e único por teste/execução, para nunca colidir com dados existentes. */
export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function expectOk<T>(response: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<T> {
  expect(response.ok(), `${what}: HTTP ${response.status()} ${await response.text()}`).toBeTruthy()
  return (await response.json()) as T
}

export async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email, password: SEED_PASSWORD } })
  const { accessToken } = await expectOk<{ accessToken: string }>(response, `login de ${email}`)
  return accessToken
}

/** Abre a sessão no navegador com um JWT obtido pela API (usado nos fluxos que não testam o login). */
export async function signInViaApi(page: Page, request: APIRequestContext, email: string): Promise<string> {
  const token = await apiLogin(request, email)
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_STORAGE_KEY, token] as const,
  )
  return token
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/** Cria cliente + modelo ativos pela API, com nomes únicos (colisão impossível entre execuções). */
export async function createClientAndTemplateViaApi(request: APIRequestContext, token: string) {
  const id = uniqueId()
  const clientName = `Cliente E2E ${id}`
  const templateName = `Modelo E2E ${id}`

  const { client } = await expectOk<{ client: { id: string } }>(
    await request.post(`${API_URL}/clients`, {
      headers: authHeaders(token),
      data: { type: 'PF', name: clientName, document: `e2e${id}`.slice(0, 20), email: `e2e-${id}@example.com` },
    }),
    'criar cliente',
  )
  const { template } = await expectOk<{ template: { id: string } }>(
    await request.post(`${API_URL}/contract-templates`, {
      headers: authHeaders(token),
      data: {
        name: templateName,
        content: 'Contrato entre {{advogado.escritorio}} e {{cliente.nome}}, no valor de {{contrato.valor}}.',
        status: 'ativo',
      },
    }),
    'criar modelo',
  )
  return { id, clientId: client.id, clientName, templateId: template.id, templateName }
}

export interface ContractFixture {
  contractId: string
  contractNumber: number
  clientName: string
  templateName: string
}

/** Cria cliente + modelo + contrato (RASCUNHO) pela API. */
export async function createContractViaApi(request: APIRequestContext, token: string): Promise<ContractFixture> {
  const { id, clientId, clientName, templateId, templateName } = await createClientAndTemplateViaApi(request, token)
  const { contract } = await expectOk<{ contract: { id: string; number: number } }>(
    await request.post(`${API_URL}/contracts`, {
      headers: authHeaders(token),
      data: { clientId, templateId, value: 2500, object: `Objeto E2E ${id}`, startDate: '2026-01-15' },
    }),
    'criar contrato',
  )
  return { contractId: contract.id, contractNumber: contract.number, clientName, templateName }
}

/** Badge de status (StatusBadge) com exatamente este rótulo — não confunde com <option> nem com totais. */
export function statusBadge(page: Page, label: string) {
  return page.locator('span').filter({ hasText: new RegExp(`^${label}$`) })
}

export async function createPaymentViaApi(
  request: APIRequestContext,
  token: string,
  contractId: string,
  value = 1200,
): Promise<void> {
  await expectOk(
    await request.post(`${API_URL}/payments`, {
      headers: authHeaders(token),
      data: { contractId, installmentNumber: 1, installmentTotal: 1, value, dueDate: '2030-01-10' },
    }),
    'criar parcela',
  )
}
