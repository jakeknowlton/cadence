#!/usr/bin/env node
/**
 * Emulator only: give an existing Auth emulator user an admin profile.
 *   pnpm seed:admin you@example.com
 * Sign in once through the app first so the Auth user exists.
 * In production, create users/{uid} by hand in the Firebase console with the same fields.
 */
const PROJECT = 'demo-cadence'
const AUTH = 'http://127.0.0.1:9099'
const FIRESTORE = 'http://127.0.0.1:8080'
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

const email = process.argv[2]?.toLowerCase()
if (!email) {
  console.error('usage: pnpm seed:admin <email>')
  process.exit(1)
}

const lookup = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
  method: 'POST',
  headers: OWNER,
  body: JSON.stringify({ email: [email] }),
}).then((r) => r.json())
const user = lookup.users?.[0]
if (!user) {
  console.error(`No Auth emulator user with email ${email}. Sign in through the app first.`)
  process.exit(1)
}

const now = new Date().toISOString()
const docUrl = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${user.localId}`
const existing = await fetch(docUrl, { headers: OWNER })
const str = (v) => ({ stringValue: v })
if (existing.ok) {
  await fetch(`${docUrl}?updateMask.fieldPaths=role&updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: { role: str('admin'), status: str('active'), updatedAt: { timestampValue: now } } }),
  })
  console.log(`Promoted ${email} (${user.localId}) to admin`)
} else {
  await fetch(docUrl, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        email: str(email),
        displayName: str(user.displayName ?? email.split('@')[0]),
        photoURL: user.photoUrl ? str(user.photoUrl) : { nullValue: null },
        role: str('admin'),
        timezone: str('America/Denver'),
        status: str('active'),
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
      },
    }),
  })
  console.log(`Created admin profile for ${email} (${user.localId})`)
}
