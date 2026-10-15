import { expect, test } from '@playwright/test'

test('unauthenticated visitors land on the sign-in page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('an invite link shows the invited sign-in screen', async ({ page }) => {
  await page.goto('/invite/some-token-value-123456')
  await expect(page.getByRole('heading', { name: /you're invited/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
})
