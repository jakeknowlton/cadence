import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { Timestamp, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { assertFails, assertSucceeds, createTestEnv } from './setup'
import { ADMIN, GROUP, MEMBER, OTHER, STRANGER, asUser, group, member, seedWorld, version } from './helpers'

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

describe('groups', () => {
  it('members and admins read; non-members and strangers do not', async () => {
    await assertSucceeds(getDoc(doc(asUser(env, MEMBER), 'groups', GROUP)))
    await assertSucceeds(getDoc(doc(asUser(env, ADMIN), 'groups', GROUP)))
    await assertFails(getDoc(doc(asUser(env, STRANGER), 'groups', GROUP)))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups', 'g2'), group({ memberIds: [ADMIN], formerMemberIds: [MEMBER] }))
    })
    await assertSucceeds(getDoc(doc(asUser(env, MEMBER), 'groups', 'g2'))) // former member
    await assertFails(getDoc(doc(asUser(env, OTHER), 'groups', 'g2')))
  })

  it('only admins create groups, with a valid shape', async () => {
    const fresh = { ...group({ memberIds: [], createdAt: serverTimestamp() }) }
    await assertSucceeds(setDoc(doc(asUser(env, ADMIN), 'groups', 'g2'), fresh))
    await assertFails(setDoc(doc(asUser(env, MEMBER), 'groups', 'g3'), fresh))
    await assertFails(setDoc(doc(asUser(env, ADMIN), 'groups', 'g4'), { ...fresh, weekStartsOn: 3 }))
    await assertFails(setDoc(doc(asUser(env, ADMIN), 'groups', 'g5'), { ...fresh, editWindowDays: 99 }))
    await assertFails(setDoc(doc(asUser(env, ADMIN), 'groups', 'g6'), { ...fresh, weekStartLocked: true }))
  })

  it('admin edits; week start changes only while unlocked', async () => {
    const db = asUser(env, ADMIN)
    await assertSucceeds(updateDoc(doc(db, 'groups', GROUP), { name: 'New name', weekStartsOn: 0 }))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'groups', GROUP), { weekStartLocked: true })
    })
    await assertFails(updateDoc(doc(db, 'groups', GROUP), { weekStartsOn: 1 }))
    await assertSucceeds(updateDoc(doc(db, 'groups', GROUP), { name: 'Still fine' }))
  })

  it('a member may only flip weekStartLocked to true', async () => {
    const db = asUser(env, MEMBER)
    await assertSucceeds(updateDoc(doc(db, 'groups', GROUP), { weekStartLocked: true }))
    await assertFails(updateDoc(doc(db, 'groups', GROUP), { weekStartLocked: false }))
    await assertFails(updateDoc(doc(db, 'groups', GROUP), { name: 'hijack' }))
    await assertFails(updateDoc(doc(db, 'groups', GROUP), { memberIds: [MEMBER] }))
  })
})

describe('members', () => {
  it('members read the roster; outsiders do not', async () => {
    await assertSucceeds(getDocs(collection(asUser(env, MEMBER), 'groups', GROUP, 'members')))
    await assertFails(getDocs(collection(asUser(env, STRANGER), 'groups', GROUP, 'members')))
  })
  it('admin adds members; members cannot', async () => {
    const fresh = { ...member('new-uid'), joinedAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(asUser(env, ADMIN), 'groups', GROUP, 'members', 'new-uid'), fresh))
    await assertFails(setDoc(doc(asUser(env, MEMBER), 'groups', GROUP, 'members', 'new2'), { ...member('new2'), joinedAt: serverTimestamp() }))
  })
  it('a member edits only their own notification prefs', async () => {
    const db = asUser(env, MEMBER)
    const prefs = { onMemberCompletion: { enabled: false, cadences: [], taskIds: null } }
    await assertSucceeds(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER), { notifications: prefs }))
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER), { leftAt: Timestamp.now(), notifications: prefs }))
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', OTHER), { notifications: prefs }))
  })
})

describe('task versions', () => {
  it('members read; non-admins cannot write', async () => {
    await assertSucceeds(getDocs(collection(asUser(env, MEMBER), 'groups', GROUP, 'taskVersions')))
    await assertFails(setDoc(doc(asUser(env, MEMBER), 'groups', GROUP, 'taskVersions', 'x'), { ...version(), createdAt: serverTimestamp() }))
  })

  it('admin creates version 1 and a well-formed version 2', async () => {
    const db = asUser(env, ADMIN)
    await assertSucceeds(setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'w1'), { ...version({ taskId: 'water' }), createdAt: serverTimestamp() }))
    const v2 = version({
      version: 2, prevVersionId: 'v1', effectiveFrom: '2026-10-16',
      fieldTypes: { miles: 'number|mi', time: 'duration|', pace: 'number|min/mi' },
      fieldKeys: ['miles', 'time', 'pace'],
    })
    await assertSucceeds(setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'v2'), { ...v2, createdAt: serverTimestamp() }))
  })

  it('refuses a new version that changes a field type or unit, drops lineage keys, or skips numbers', async () => {
    const db = asUser(env, ADMIN)
    const km = version({ version: 2, prevVersionId: 'v1', fieldTypes: { miles: 'number|km', time: 'duration|' } })
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'v2'), { ...km, createdAt: serverTimestamp() }))
    const dropped = version({ version: 2, prevVersionId: 'v1', fieldTypes: { time: 'duration|' }, fieldKeys: ['time'] })
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'v2'), { ...dropped, createdAt: serverTimestamp() }))
    const skipped = version({ version: 3, prevVersionId: 'v1' })
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'v3'), { ...skipped, createdAt: serverTimestamp() }))
    const wrongTask = version({ version: 2, prevVersionId: 'v1', taskId: 'other' })
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'v2'), { ...wrongTask, createdAt: serverTimestamp() }))
  })

  it('in-place edits are limited to cosmetic fields, closing, and field labels', async () => {
    const db = asUser(env, ADMIN)
    const ref = doc(db, 'groups', GROUP, 'taskVersions', 'v1')
    await assertSucceeds(updateDoc(ref, { name: 'Run', icon: 'Sneaker', sortOrder: 2, effectiveTo: '2026-10-15' }))
    await assertFails(updateDoc(ref, { cadence: 'weekly' }))
    await assertFails(updateDoc(ref, { requiredCount: 2 }))
    await assertFails(updateDoc(ref, { 'snapshot.cadence': 'weekly' }))
    await assertFails(updateDoc(ref, { fieldTypes: { miles: 'number|km' } }))
  })
})
