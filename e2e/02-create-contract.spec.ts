import { expect, test } from '@playwright/test'

import { createClientAndTemplateViaApi, signInViaApi, statusBadge, USERS } from './helpers'

test('Fluxo 2 — criar contrato: cliente + modelo → contrato criado como rascunho', async ({ page, request }) => {
  const token = await signInViaApi(page, request, USERS.lawyer.email)
  // Pré-requisitos (cliente e modelo) pela API: este teste cobre a criação do contrato, não o CRUD deles.
  const { id, clientName, templateName } = await createClientAndTemplateViaApi(request, token)
  const objectText = `Objeto E2E ${id}`

  await page.goto('/contratos/novo')

  // 1. Cliente (busca pelo nome único)
  await page.getByPlaceholder('Buscar cliente...').fill(clientName)
  await page.getByText(clientName, { exact: true }).click()
  await page.getByRole('button', { name: /continuar/i }).click()

  // 2. Modelo (lista ordenada por atualização: o recém-criado vem primeiro)
  await page.getByText(templateName, { exact: true }).click()
  await page.getByRole('button', { name: /continuar/i }).click()

  // 3. Informações
  await page.getByLabel(/^Valor \(R\$\)/).fill('2500')
  await page.getByLabel(/^Data de início/).fill('2026-01-15')
  await page.getByLabel(/^Objeto do contrato/).fill(objectText)
  await page.getByRole('button', { name: /continuar/i }).click()

  // 4. Revisão → finalizar
  await expect(page.getByText(objectText)).toBeVisible()
  await page.getByRole('button', { name: /finalizar/i }).click()

  // 5. Contrato criado
  await expect(page.getByRole('heading', { name: /Contrato #\d+ criado com sucesso!/ })).toBeVisible()
  await page.getByRole('button', { name: 'Ver contrato' }).click()

  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  await expect(page.getByText(clientName).first()).toBeVisible()
  await expect(statusBadge(page, 'Rascunho')).toBeVisible()
})
