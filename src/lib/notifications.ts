import type { Cadence } from '@/types/task'
import type { Membership } from '@/types/group'

export function inboxItemId(actorId: string, taskId: string, periodKey: string): string {
  return `${actorId}_${taskId}_${periodKey}`
}

/** Members who should be told that `actorId` completed `taskId` with cadence `cadence`. */
export function recipientsFor(
  members: Membership[],
  opts: { actorId: string; taskId: string; cadence: Cadence },
): string[] {
  return members
    .filter((m) => m.userId !== opts.actorId && m.leftAt === null)
    .filter((m) => {
      const p = m.notifications?.onMemberCompletion
      if (!p?.enabled) return false
      if (!p.cadences.includes(opts.cadence)) return false
      if (p.taskIds !== null && !p.taskIds.includes(opts.taskId)) return false
      return true
    })
    .map((m) => m.userId)
}

export const DEFAULT_PREFS: Membership['notifications'] = {
  onMemberCompletion: { enabled: false, cadences: ['daily', 'weekly', 'monthly'], taskIds: null },
}
