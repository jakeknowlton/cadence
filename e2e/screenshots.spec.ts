/* eslint-disable playwright/no-skipped-test, playwright/no-wait-for-timeout, playwright/expect-expect, playwright/no-conditional-in-test */
import { test, type Page } from '@playwright/test'
import { makeAdmin, resetEmulators, signIn } from './emulator'

// Design review captures. Run with SCREENSHOTS=<dir> pnpm test:e2e; skipped otherwise.
const DIR = process.env.SCREENSHOTS
test.skip(!DIR, 'set SCREENSHOTS=<dir> to capture')
test.setTimeout(240_000)
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false })
}
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('cadence:theme', t), theme)
  await page.reload()
}

test('capture key screens', async ({ page }) => {
  await resetEmulators()
  await page.goto('/login')
  await setTheme(page, 'light')
  await shot(page, '01-login-light')
  const uid = await signIn(page, 'jake@example.com')
  await makeAdmin(uid, 'jake@example.com')
  await page.goto('/')

  // group + member + tasks
  await page.goto('/admin/groups')
  await page.getByRole('button', { name: /new group/i }).click()
  await page.getByLabel('Name').fill('Fall Shred Crew')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('tab', { name: 'Members' }).click()
  await page.locator('select').first().selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.locator('#g-color').selectOption('teal')
  await page.getByRole('button', { name: 'Save changes' }).click()

  const addTask = async (name: string, icon: string, fields = false) => {
    await page.getByRole('tab', { name: 'Tasks' }).click()
    await page.getByRole('button', { name: /new task/i }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: icon }).click()
    if (fields) {
      await page.getByLabel('Log details').click()
      await page.getByRole('button', { name: /add field/i }).click()
      await page.getByPlaceholder('Label (e.g. Distance)').fill('Distance')
      await page.getByPlaceholder('Unit (mi, kcal)').fill('mi')
      await page.getByLabel('Goal', { exact: true }).click()
      await page.getByPlaceholder('Value').fill('1')
    }
    await page.getByRole('button', { name: 'Create task' }).click()
  }
  await addTask('Drink 100 oz water', 'Drop')
  await addTask('Run a mile', 'PersonSimpleRun', true)
  await addTask('Stretch', 'YinYang')
  await shot(page, '02-admin-tasks')
  await page.getByRole('button', { name: /new task/i }).click()
  await shot(page, '03-task-editor')

  await page.goto('/')
  await page.getByRole('listitem').filter({ hasText: 'Drink 100 oz water' }).getByRole('button', { name: 'Mark done' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Run a mile' }).getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByLabel(/Distance/).fill('1.4')
  await shot(page, '04-sheet')
  await page.getByRole('button', { name: 'Log it' }).click()
  await page.waitForTimeout(300)
  await shot(page, '05-today-light')
  await setTheme(page, 'dark')
  await shot(page, '06-today-dark')

  await page.getByRole('link', { name: 'Fall Shred Crew' }).first().click()
  await shot(page, '07-group-dark')
  await page.getByRole('link', { name: 'Stats' }).click()
  await page.waitForTimeout(800)
  await shot(page, '08-stats-dark')
  await setTheme(page, 'light')
  await page.waitForTimeout(800)
  await shot(page, '09-stats-light')
  await page.goto('/me')
  await shot(page, '10-me-light')
  await page.goto('/admin/users')
  await shot(page, '11-admin-people')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await shot(page, '12-today-desktop')
  await page.goto('/groups')
  await page.getByRole('link', { name: /Fall Shred Crew/ }).click()
  await shot(page, '13-group-desktop')
})
