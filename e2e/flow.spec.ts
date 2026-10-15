import { expect, test, type Page } from '@playwright/test'
import { makeAdmin, resetEmulators, signIn } from './emulator'

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const ADMIN = 'admin@example.com'
const FRIEND = 'friend@example.com'

async function signInAs(page: Page, email: string) {
  await page.goto('/login')
  const uid = await signIn(page, email)
  // Sign-in state changes are picked up live; force the guard to re-run.
  await page.goto('/')
  return uid
}

test.beforeAll(async () => {
  await resetEmulators()
})

test('admin bootstraps, builds a group and task, logs it, and invites a friend who joins', async ({ page }) => {
  // --- a signed-in user without a profile is locked out ---
  const adminUid = await signInAs(page, ADMIN)
  await expect(page.getByRole('heading', { name: /you need an invite/i })).toBeVisible()

  // --- bootstrap the first admin out of band, like the seed script ---
  await makeAdmin(adminUid, ADMIN)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admin' }).first()).toBeVisible()

  // --- create a group and join it ---
  await page.goto('/admin/groups')
  await page.getByRole('button', { name: /new group/i }).click()
  await page.getByLabel('Name').fill('Test Crew')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: 'Test Crew' })).toBeVisible()

  await page.getByRole("tab", { name: "Members" }).click()
  await page.locator('select').first().selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

  // --- add a checkbox task ---
  await page.getByRole("tab", { name: "Tasks" }).click()
  await page.getByRole('button', { name: /new task/i }).click()
  await page.getByLabel('Name').fill('Drink water')
  await expect(page.getByText(/new task, starts today/i)).toBeVisible()
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Drink water')).toBeVisible()

  // --- add a field task with a gating goal ---
  await page.getByRole('button', { name: /new task/i }).click()
  await page.getByLabel('Name').fill('Log calories')
  await page.getByLabel('Log details').click()
  await page.getByRole('button', { name: /add field/i }).click()
  await page.getByPlaceholder('Label (e.g. Distance)').fill('Calories')
  await page.getByPlaceholder('Unit (mi, kcal)').fill('kcal')
  await page.getByLabel('Required').click()
  await page.getByLabel('Goal', { exact: true }).click()
  await page.locator('select').nth(3).selectOption('<=')
  await page.getByPlaceholder('Value').fill('2200')
  await page.getByLabel('Goal required to count').click()
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Log calories')).toBeVisible()

  // --- log both on Today ---
  await page.goto('/')
  const water = page.getByRole('listitem').filter({ hasText: 'Drink water' })
  await water.getByRole('button', { name: 'Mark done' }).click()
  await expect(water.getByRole('button', { name: 'Mark not done' })).toBeVisible()

  const calories = page.getByRole('listitem').filter({ hasText: 'Log calories' })
  await calories.getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByLabel(/Calories/).fill('2500')
  await expect(page.getByText(/goal not met: this won’t count yet/i)).toBeVisible()
  await page.getByRole('button', { name: 'Log it' }).click()
  await expect(calories.getByText(/logged, goal not met/i)).toBeVisible()
  await calories.getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByLabel(/Calories/).fill('2000')
  await page.getByRole('button', { name: 'Log another' }).click()
  await expect(calories.getByRole('button', { name: 'Mark not done' })).toBeVisible()

  // --- group page shows the grid and feed ---
  await page.getByRole('link', { name: 'Test Crew' }).first().click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(page.getByText(/Admin did Drink water/)).toBeVisible()

  // --- invite a friend ---
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await page.getByLabel('Email').fill(FRIEND)
  await page.getByRole('button', { name: 'Create invite' }).click()
  const link = await page.locator('input[readonly]').inputValue()
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{16,}$/)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(FRIEND)).toBeVisible()

  // --- friend signs in and accepts ---
  await page.goto('/me')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await signIn(page, FRIEND)
  await page.goto(new URL(link).pathname)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/No groups yet/)).toBeVisible()

  // --- a used invite cannot be reused ---
  await page.goto('/me')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, 'third@example.com')
  await page.goto(new URL(link).pathname)
  await expect(page.getByText(/different email address|already been used/i)).toBeVisible()
})
