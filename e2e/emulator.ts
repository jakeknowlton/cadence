import type { Page } from '@playwright/test'

export const PROJECT = 'demo-cadence'
const AUTH = 'http://127.0.0.1:9099'
const FIRESTORE = 'http://127.0.0.1:8080'
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

export async function resetEmulators() {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE', headers: OWNER })
}

/** Sign in through the app's dev-only hook (email/password against the emulator). */
export async function signIn(page: Page, email: string) {
  await page.waitForFunction(() => '__cadenceTest' in window)
  const uid = await page.evaluate(
    ([e]) => (window as unknown as { __cadenceTest: { signIn: (e: string, p: string) => Promise<string> } }).__cadenceTest.signIn(e!, 'password-123'),
    [email],
  )
  // Mark the email verified so invite acceptance passes the rules' check, then refresh the token.
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  })
  await page.evaluate(() => (window as unknown as { __cadenceTest: { refresh: () => Promise<void> } }).__cadenceTest.refresh())
  return uid as string
}

const str = (v: string) => ({ stringValue: v })
export async function makeAdmin(uid: string, email: string) {
  const now = new Date().toISOString()
  await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        email: str(email), displayName: str('Admin'), photoURL: { nullValue: null }, role: str('admin'),
        timezone: str('America/Denver'), status: str('active'),
        createdAt: { timestampValue: now }, updatedAt: { timestampValue: now },
      },
    }),
  })
}

/** Apply the Auth emulator's latest verification code for an address, as if the user clicked the email link. */
export async function verifyEmailViaEmulator(email: string) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`, { headers: OWNER })
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; requestType: string; oobCode: string }[] }
  const code = oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').at(-1)
  if (!code) throw new Error(`no verification email sent to ${email}`)
  const applied = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=any`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code.oobCode }),
  })
  if (!applied.ok) throw new Error(`could not apply verification code: ${await applied.text()}`)
}
