import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Membership } from '@/types/group'
import { inboxItemId, recipientsFor } from './notifications'

function m(userId: string, prefs: Partial<Membership['notifications']['onMemberCompletion']> = {}, leftAt: Timestamp | null = null): Membership {
  return { id: userId, userId, joinedAt: Timestamp.now(), leftAt,
    notifications: { onMemberCompletion: { enabled: true, cadences: ['daily', 'weekly', 'monthly'], taskIds: null, ...prefs } } }
}

describe('recipientsFor', () => {
  const opts = { actorId: 'a', taskId: 't1', cadence: 'daily' as const }
  it('excludes the actor, members who left, and opted-out members', () => {
    const members = [m('a'), m('b'), m('c', {}, Timestamp.now()), m('d', { enabled: false })]
    expect(recipientsFor(members, opts)).toEqual(['b'])
  })
  it('respects cadence and task filters', () => {
    const members = [m('b', { cadences: ['weekly'] }), m('c', { taskIds: ['t2'] }), m('d', { taskIds: ['t1'] })]
    expect(recipientsFor(members, opts)).toEqual(['d'])
  })
  it('tolerates a membership without prefs', () => {
    const bare = { ...m('b'), notifications: undefined } as unknown as Membership
    expect(recipientsFor([bare], opts)).toEqual([])
  })
})

describe('inboxItemId', () => {
  it('is deterministic per actor, task, and period', () => {
    expect(inboxItemId('a', 't1', 'd:2026-10-15')).toBe('a_t1_d:2026-10-15')
  })
})
