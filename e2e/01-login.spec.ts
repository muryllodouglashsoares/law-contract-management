import { expect, test } from '@playwright/test'

import { SEED_PASSWORD, USERS } from './helpers'

test('Fluxo 1 — login: autentica pela interface e entra no sistema', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('E-mail').fill(USERS.admin.email)
  await page.getByLabel('Senha', { exact: true }).fill(SEED_PASSWORD)
  await page.getByRole('button', { name: /entrar/i }).click()

  // Os usuários semeados não têm senha provisória; se tivessem, a tela de troca obrigatória
  // (ForcePasswordChange) apareceria no lugar do dashboard e este teste falharia de propósito.
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Defina uma nova senha' })).toHaveCount(0)
  // Shell autenticado: o botão "Sair" só existe dentro do ProtectedRoute/AppLayout.
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
})
