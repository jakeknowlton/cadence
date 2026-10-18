import { Timestamp } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'

export const ADMIN = 'admin-uid'
export const MEMBER = 'member-uid'
export const OTHER = 'other-uid'
export const DEACTIVATED = 'deactivated-uid'
export const STRANGER = 'stranger-uid' // signed in, no profile
export const GROUP = 'g1'

export function profile(uid: string, role: 'user' | 'admin' = 'user', status: 'active' | 'deactivated' = 'active') {
  return {
    email: `${uid}@example.com`,
    displayName: uid,
    photoURL: null,
    role,
    timezone: 'America/Denver',
    status,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }
}

export function group(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Crew',
    description: '',
    icon: 'Barbell',
    color: 'zinc',
    memberIds: [ADMIN, MEMBER, OTHER],
    formerMemberIds: [],
    weekStartsOn: 1,
    weekStartLocked: false,
    editWindowDays: 2,
    archivedAt: null,
    createdAt: Timestamp.now(),
    createdBy: ADMIN,
    ...overrides,
  }
}

export function member(uid: string) {
  return {
    userId: uid,
    joinedAt: Timestamp.now(),
    leftAt: null,
    notifications: { onMemberCompletion: { enabled: true, cadences: ['daily', 'weekly', 'monthly'], taskIds: null } },
  }
}

export const RUN_SNAPSHOT = {
  cadence: 'daily',
  activeDays: null,
  requiredCount: 1,
  completionType: 'fields',
  fields: [
    { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, min: 1, step: 0.1, default: 1 },
    { key: 'time', label: 'Time', type: 'duration', required: false },
  ],
}

export function version(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'run',
    version: 1,
    prevVersionId: null,
    replaces: null,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    name: 'Run a mile',
    description: '',
    icon: 'PersonSimpleRun',
    sortOrder: 1,
    ...RUN_SNAPSHOT,
    fieldKeys: ['miles', 'time'],
    fieldTypes: { miles: 'number|mi', time: 'duration|' },
    snapshot: RUN_SNAPSHOT,
    createdAt: Timestamp.now(),
    createdBy: ADMIN,
    ...overrides,
  }
}

export function completion(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    userId: uid,
    groupId: GROUP,
    taskId: 'run',
    taskVersionId: 'v1',
    taskName: 'Run a mile',
    cadence: 'daily',
    periodKey: 'd:2026-10-15',
    weekStartsOn: 1,
    completedAt: Timestamp.now(),
    loggedAt: Timestamp.now(),
    values: { miles: 1.2 },
    note: null,
    taskSnapshot: RUN_SNAPSHOT,
    deletedAt: null,
    ...overrides,
  }
}

/** Seed a standard world: admin, member, other, deactivated users; one group with v1 of "run". */
export async function seedWorld(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const { doc, setDoc } = await import('firebase/firestore')
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ADMIN), profile(ADMIN, 'admin'))
    await setDoc(doc(db, 'users', MEMBER), profile(MEMBER))
    await setDoc(doc(db, 'users', OTHER), profile(OTHER))
    await setDoc(doc(db, 'users', DEACTIVATED), profile(DEACTIVATED, 'user', 'deactivated'))
    await setDoc(doc(db, 'groups', GROUP), group())
    for (const uid of [ADMIN, MEMBER, OTHER]) await setDoc(doc(db, 'groups', GROUP, 'members', uid), member(uid))
    await setDoc(doc(db, 'groups', GROUP, 'taskVersions', 'v1'), version())
  })
}

export function asUser(env: RulesTestEnvironment, uid: string, email = `${uid}@example.com`) {
  return env.authenticatedContext(uid, { email, email_verified: true }).firestore()
}
