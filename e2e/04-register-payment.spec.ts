import { expect, test } from '@playwright/test'

import { createContractViaApi, createPaymentViaApi, signInViaApi, statusBadge, USERS } from './helpers'

test('Fluxo 4 — registrar pagamento: parcela em aberto → paga e persistida', async ({ page, request }) => {
  const token = await signInViaApi(page, request, USERS.admin.email)
  const { contractId, templateName } = await createContractViaApi(request, token)
  await createPaymentViaApi(request, token, contractId)

  await page.goto(`/contratos/${contractId}`)
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  await page.getByRole('button', { name: 'Pagamentos' }).click()

  await expect(page.getByText('Parcela 1/1')).toBeVisible()
  await expect(statusBadge(page, 'A vencer')).toBeVisible()

  await page.getByRole('button', { name: 'Registrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Registrar pagamento' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar' }).click()

  // A parcela passa a "Pago", sem o botão de registro...
  await expect(statusBadge(page, 'Pago')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar', exact: true })).toHaveCount(0)

  // ...e isso vem do banco: continua assim depois de recarregar.
  await page.reload()
  await page.getByRole('button', { name: 'Pagamentos' }).click()
  await expect(page.getByText('Parcela 1/1')).toBeVisible()
  await expect(statusBadge(page, 'Pago')).toBeVisible()
  await expect(page.getByText(/· PIX/)).toBeVisible()
})
