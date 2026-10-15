import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { Timestamp, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { assertFails, assertSucceeds, createTestEnv } from './setup'
import { ADMIN, DEACTIVATED, MEMBER, STRANGER, asUser, profile, seedWorld } from './helpers'

let env: RulesTestEnvironment
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env.cleanup()
})
beforeEach(async () => {
  await env.clearFirestore()
  await seedWorld(env)
})

describe('users', () => {
  it('a signed-in user with no profile can read only their own (missing) profile', async () => {
    const db = asUser(env, STRANGER)
    await assertSucceeds(getDoc(doc(db, 'users', STRANGER)))
    await assertFails(getDoc(doc(db, 'users', MEMBER)))
  })

  it('an active user can read other profiles; a deactivated user cannot', async () => {
    await assertSucceeds(getDoc(doc(asUser(env, MEMBER), 'users', ADMIN)))
    await assertFails(getDoc(doc(asUser(env, DEACTIVATED), 'users', ADMIN)))
  })

  it('nobody can create a profile outside the invite flow', async () => {
    await assertFails(setDoc(doc(asUser(env, STRANGER), 'users', STRANGER), profile(STRANGER)))
    await assertFails(setDoc(doc(asUser(env, ADMIN), 'users', 'new-uid'), profile('new-uid')))
  })

  it('a user can update their own display name and timezone but not their role or status', async () => {
    const db = asUser(env, MEMBER)
    await assertSucceeds(updateDoc(doc(db, 'users', MEMBER), { displayName: 'Sam', timezone: 'UTC', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, 'users', MEMBER), { role: 'admin' }))
    await assertFails(updateDoc(doc(db, 'users', MEMBER), { status: 'deactivated' }))
    await assertFails(updateDoc(doc(db, 'users', MEMBER), { displayName: '' }))
    await assertFails(updateDoc(doc(db, 'users', ADMIN), { displayName: 'x' }))
  })

  it('an admin can change role and status but not email', async () => {
    const db = asUser(env, ADMIN)
    await assertSucceeds(updateDoc(doc(db, 'users', MEMBER), { role: 'admin', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(db, 'users', MEMBER), { status: 'deactivated', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, 'users', MEMBER), { role: 'owner' }))
    await assertFails(updateDoc(doc(db, 'users', MEMBER), { email: 'other@example.com' }))
  })

  it('private subcollection is owner-only', async () => {
    await assertSucceeds(setDoc(doc(asUser(env, MEMBER), 'users', MEMBER, 'private', 'fcm'), { tokens: {} }))
    await assertFails(getDoc(doc(asUser(env, ADMIN), 'users', MEMBER, 'private', 'fcm')))
  })
})

describe('invites', () => {
  const TOKEN = 'abcdefghijklmnopqrstuvwx'
  const invite = (by: string) => ({
    email: 'new@example.com',
    invitedBy: by,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86_400_000),
  })

  async function seedInvite(overrides: Record<string, unknown> = {}) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites', TOKEN), { ...invite(ADMIN), createdAt: Timestamp.now(), ...overrides })
    })
  }

  it('admin can create a well-formed invite with a long token id', async () => {
    await assertSucceeds(setDoc(doc(asUser(env, ADMIN), 'invites', TOKEN), invite(ADMIN)))
    await assertFails(setDoc(doc(asUser(env, ADMIN), 'invites', 'short'), invite(ADMIN)))
  })

  it('invite must be lowercase, pending, and name the caller as inviter', async () => {
    const db = asUser(env, ADMIN)
    await assertFails(setDoc(doc(db, 'invites', TOKEN), { ...invite(ADMIN), email: 'New@Example.com' }))
    await assertFails(setDoc(doc(db, 'invites', TOKEN), { ...invite(ADMIN), status: 'accepted' }))
    await assertFails(setDoc(doc(db, 'invites', TOKEN), { ...invite(ADMIN), invitedBy: MEMBER }))
    await assertFails(setDoc(doc(db, 'invites', TOKEN), { ...invite(ADMIN), email: 'not-an-email' }))
  })

  it('non-admins cannot create or list invites', async () => {
    await assertFails(setDoc(doc(asUser(env, MEMBER), 'invites', TOKEN), invite(MEMBER)))
    await assertFails(getDocs(collection(asUser(env, MEMBER), 'invites')))
  })

  it('only the invitee (verified, matching email) can read a specific invite', async () => {
    await seedInvite()
    await assertSucceeds(getDoc(doc(asUser(env, STRANGER, 'new@example.com'), 'invites', TOKEN)))
    await assertFails(getDoc(doc(asUser(env, STRANGER, 'someone@example.com'), 'invites', TOKEN)))
    const unverified = env.authenticatedContext(STRANGER, { email: 'new@example.com', email_verified: false }).firestore()
    await assertFails(getDoc(doc(unverified, 'invites', TOKEN)))
  })

  it('admin can revoke but not accept from the client', async () => {
    await seedInvite()
    const db = asUser(env, ADMIN)
    await assertFails(updateDoc(doc(db, 'invites', TOKEN), { status: 'accepted' }))
    await assertSucceeds(updateDoc(doc(db, 'invites', TOKEN), { status: 'revoked' }))
  })

  function acceptBatch(db: ReturnType<typeof asUser>, uid: string, overrides: Record<string, unknown> = {}) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'invites', TOKEN), { status: 'accepted', acceptedAt: serverTimestamp(), acceptedBy: uid })
    batch.set(doc(db, 'users', uid), {
      email: 'new@example.com',
      displayName: 'New',
      photoURL: null,
      role: 'user',
      timezone: 'UTC',
      status: 'active',
      inviteToken: TOKEN,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    })
    return batch.commit()
  }

  it('the invitee can accept by creating their profile and marking the invite accepted in one batch', async () => {
    await seedInvite()
    await assertSucceeds(acceptBatch(asUser(env, STRANGER, 'new@example.com'), STRANGER))
  })

  it('acceptance is refused for the wrong email, an unverified email, a used invite, or an expired one', async () => {
    await seedInvite()
    await assertFails(acceptBatch(asUser(env, STRANGER, 'wrong@example.com'), STRANGER, { email: 'wrong@example.com' }))
    const unverified = env.authenticatedContext(STRANGER, { email: 'new@example.com', email_verified: false }).firestore()
    await assertFails(acceptBatch(unverified, STRANGER))

    await seedInvite({ status: 'revoked' })
    await assertFails(acceptBatch(asUser(env, STRANGER, 'new@example.com'), STRANGER))
    await seedInvite({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    await assertFails(acceptBatch(asUser(env, STRANGER, 'new@example.com'), STRANGER))
  })

  it('the profile cannot be created as admin, or without accepting the invite in the same batch', async () => {
    await seedInvite()
    const db = asUser(env, STRANGER, 'new@example.com')
    await assertFails(acceptBatch(db, STRANGER, { role: 'admin' }))
    await assertFails(
      setDoc(doc(db, 'users', STRANGER), {
        email: 'new@example.com', displayName: 'New', photoURL: null, role: 'user', timezone: 'UTC',
        status: 'active', inviteToken: TOKEN, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    )
  })

  it('the invite cannot be marked accepted without creating the profile in the same batch', async () => {
    await seedInvite()
    const db = asUser(env, STRANGER, 'new@example.com')
    await assertFails(updateDoc(doc(db, 'invites', TOKEN), { status: 'accepted', acceptedAt: serverTimestamp(), acceptedBy: STRANGER }))
  })
})
