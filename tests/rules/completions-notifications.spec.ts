import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { Timestamp, collection, collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, deleteDoc } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { assertFails, assertSucceeds, createTestEnv } from './setup'
import { ADMIN, GROUP, MEMBER, OTHER, STRANGER, asUser, completion, group, seedWorld } from './helpers'

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

const live = (uid: string, o: Record<string, unknown> = {}) =>
  completion(uid, { completedAt: serverTimestamp(), loggedAt: serverTimestamp(), ...o })

describe('completions', () => {
  it('a member logs a well-formed completion for themselves', async () => {
    await assertSucceeds(setDoc(doc(asUser(env, MEMBER), 'groups', GROUP, 'completions', 'c1'), live(MEMBER)))
  })

  it('rejects impersonation, non-members, and malformed data', async () => {
    const db = asUser(env, MEMBER)
    const ref = () => doc(db, 'groups', GROUP, 'completions', `c-${Math.random()}`)
    await assertFails(setDoc(ref(), live(OTHER)))
    await assertFails(setDoc(doc(asUser(env, STRANGER), 'groups', GROUP, 'completions', 'x'), live(STRANGER)))
    await assertFails(setDoc(ref(), live(MEMBER, { taskSnapshot: { cadence: 'weekly' } })))
    await assertFails(setDoc(ref(), live(MEMBER, { values: { miles: 1, bogus: 2 } })))
    await assertFails(setDoc(ref(), live(MEMBER, { periodKey: '2026-10-15' })))
    await assertFails(setDoc(ref(), live(MEMBER, { periodKey: 'w:2026-10-12' }))) // cadence is daily
    await assertFails(setDoc(ref(), live(MEMBER, { taskVersionId: 'nope' })))
    await assertFails(setDoc(ref(), live(MEMBER, { taskId: 'other' })))
    await assertFails(setDoc(ref(), live(MEMBER, { weekStartsOn: 0 })))
    await assertFails(setDoc(ref(), live(MEMBER, { deletedAt: Timestamp.now() })))
    await assertFails(setDoc(ref(), live(MEMBER, { loggedAt: Timestamp.fromMillis(0) })))
  })

  it('bounds completedAt to the edit window plus slack', async () => {
    const db = asUser(env, MEMBER)
    const ago = (d: number) => Timestamp.fromMillis(Date.now() - d * 86_400_000)
    await assertSucceeds(setDoc(doc(db, 'groups', GROUP, 'completions', 'ok'), live(MEMBER, { completedAt: ago(3) })))
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'completions', 'old'), live(MEMBER, { completedAt: ago(5) })))
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'completions', 'future'), live(MEMBER, { completedAt: ago(-2) })))
  })

  it('owner edits values and soft-deletes; others cannot; admin can', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups', GROUP, 'completions', 'c1'), completion(MEMBER))
    })
    const mine = doc(asUser(env, MEMBER), 'groups', GROUP, 'completions', 'c1')
    await assertSucceeds(updateDoc(mine, { values: { miles: 2 }, note: 'felt good' }))
    await assertFails(updateDoc(mine, { values: { bogus: 1 } }))
    await assertFails(updateDoc(mine, { userId: OTHER }))
    await assertFails(updateDoc(doc(asUser(env, OTHER), 'groups', GROUP, 'completions', 'c1'), { note: 'x' }))
    await assertSucceeds(updateDoc(mine, { deletedAt: serverTimestamp() }))
    await assertFails(deleteDoc(mine))
    await assertSucceeds(updateDoc(doc(asUser(env, ADMIN), 'groups', GROUP, 'completions', 'c1'), { note: 'admin fix' }))
  })

  it('a former member reads their own completions, including via collection group, but not others', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'groups', GROUP), group({ memberIds: [ADMIN, OTHER], formerMemberIds: [MEMBER] }))
      await setDoc(doc(db, 'groups', GROUP, 'completions', 'mine'), completion(MEMBER))
      await setDoc(doc(db, 'groups', GROUP, 'completions', 'theirs'), completion(OTHER))
    })
    const db = asUser(env, MEMBER)
    await assertSucceeds(getDoc(doc(db, 'groups', GROUP, 'completions', 'mine')))
    await assertFails(getDoc(doc(db, 'groups', GROUP, 'completions', 'theirs')))
    await assertSucceeds(getDocs(query(collectionGroup(db, 'completions'), where('userId', '==', MEMBER))))
    await assertFails(getDocs(collection(db, 'groups', GROUP, 'completions')))
  })
})

describe('notifications', () => {
  const item = (actor: string, o: Record<string, unknown> = {}) => ({
    type: 'member_completion', groupId: GROUP, actorId: actor, actorName: 'Member', taskId: 'run', taskName: 'Run a mile',
    completionId: 'c1', periodKey: 'd:2026-10-15', createdAt: serverTimestamp(), readAt: null, ...o,
  })
  const ID = `${MEMBER}_run_d:2026-10-15`

  it('a member writes an inbox item for another member with the deterministic id', async () => {
    const db = asUser(env, MEMBER)
    await assertSucceeds(setDoc(doc(db, 'notifications', OTHER, 'items', ID), item(MEMBER)))
    await assertFails(setDoc(doc(db, 'notifications', OTHER, 'items', 'random-id'), item(MEMBER)))
    await assertFails(setDoc(doc(db, 'notifications', MEMBER, 'items', ID), item(MEMBER))) // self
    await assertFails(setDoc(doc(db, 'notifications', OTHER, 'items', `${OTHER}_run_d:2026-10-15`), item(OTHER))) // impersonation
    await assertFails(setDoc(doc(db, 'notifications', STRANGER, 'items', ID), item(MEMBER))) // not a member
  })

  it('writing the same id twice is a no-op update that only the owner may do', async () => {
    const db = asUser(env, MEMBER)
    await assertSucceeds(setDoc(doc(db, 'notifications', OTHER, 'items', ID), item(MEMBER)))
    await assertFails(setDoc(doc(db, 'notifications', OTHER, 'items', ID), item(MEMBER)))
  })

  it('only the recipient reads, marks read, or deletes', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notifications', OTHER, 'items', ID), { ...item(MEMBER), createdAt: Timestamp.now() })
    })
    const theirs = asUser(env, OTHER)
    await assertSucceeds(getDocs(collection(theirs, 'notifications', OTHER, 'items')))
    await assertFails(getDocs(collection(asUser(env, MEMBER), 'notifications', OTHER, 'items')))
    await assertSucceeds(updateDoc(doc(theirs, 'notifications', OTHER, 'items', ID), { readAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(theirs, 'notifications', OTHER, 'items', ID), { taskName: 'x' }))
    await assertFails(deleteDoc(doc(asUser(env, MEMBER), 'notifications', OTHER, 'items', ID)))
    await assertSucceeds(deleteDoc(doc(theirs, 'notifications', OTHER, 'items', ID)))
  })
})
