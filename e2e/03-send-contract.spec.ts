import { expect, test } from '@playwright/test'

import { createContractViaApi, signInViaApi, statusBadge, USERS } from './helpers'

test('Fluxo 3 — enviar contrato: rascunho → enviado (perfil LAWYER)', async ({ page, request }) => {
  const token = await signInViaApi(page, request, USERS.lawyer.email)
  const { contractId, templateName } = await createContractViaApi(request, token)

  await page.goto(`/contratos/${contractId}`)
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  await expect(statusBadge(page, 'Rascunho')).toBeVisible()

  await page.getByRole('button', { name: 'Enviar para assinatura' }).click()

  // Persistido: o status vem do backend (PATCH /contracts/:id/status) e a ação de envio some.
  await expect(statusBadge(page, 'Enviado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar para assinatura' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  await expect(statusBadge(page, 'Enviado')).toBeVisible()
})
