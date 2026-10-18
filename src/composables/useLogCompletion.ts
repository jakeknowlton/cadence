import { collection, doc, serverTimestamp, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import type { Group, Membership, TaskVersionDoc } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'
import type { Period } from '@/lib/periods'
import { inboxItemId, recipientsFor } from '@/lib/notifications'
import { periodStatus } from '@/lib/completionStatus'

const FANOUT_CHUNK = 8 // each inbox write costs two rule reads; stay well under the per-batch limit

export function useLogCompletion() {
  const authStore = useAuthStore()

  async function log(
    group: Group,
    version: TaskVersionDoc,
    period: Period,
    opts: {
      values?: CompletionValues
      note?: string | null
      completedAt?: Date
      members: Membership[]
      /** this member's existing entries for the period, to tell whether this one completes it */
      periodEntries: Completion[]
    },
  ): Promise<string> {
    const uid = authStore.uid!
    const ref = doc(collection(db, 'groups', group.id, 'completions'))
    const batch = writeBatch(db)
    batch.set(ref, {
      userId: uid,
      groupId: group.id,
      taskId: version.taskId,
      taskVersionId: version.id,
      taskName: version.name,
      cadence: version.cadence,
      periodKey: period.key,
      weekStartsOn: group.weekStartsOn,
      completedAt: opts.completedAt ? Timestamp.fromDate(opts.completedAt) : serverTimestamp(),
      loggedAt: serverTimestamp(),
      values: opts.values ?? {},
      note: opts.note ?? null,
      taskSnapshot: version.snapshot,
      deletedAt: null,
    })
    if (version.cadence === 'weekly' && !group.weekStartLocked) {
      batch.update(doc(db, 'groups', group.id), { weekStartLocked: true })
    }
    await batch.commit()

    // Only completing the period is news: 40 squats tells nobody, the 60 that reaches 100 does.
    const asEntry = (values: CompletionValues) => ({ values, deletedAt: null }) as Completion
    const before = periodStatus(version.snapshot, opts.periodEntries).complete
    const after = periodStatus(version.snapshot, [...opts.periodEntries, asEntry(opts.values ?? {})]).complete
    if (before || !after) return ref.id

    // Best-effort inbox fan-out; a failure here must not undo the completion.
    try {
      const recipients = recipientsFor(opts.members, { actorId: uid, taskId: version.taskId, cadence: version.cadence })
      for (let i = 0; i < recipients.length; i += FANOUT_CHUNK) {
        const chunk = writeBatch(db)
        for (const to of recipients.slice(i, i + FANOUT_CHUNK)) {
          chunk.set(doc(db, 'notifications', to, 'items', inboxItemId(uid, version.taskId, period.key)), {
            type: 'member_completion',
            groupId: group.id,
            actorId: uid,
            actorName: authStore.profile?.displayName ?? 'Someone',
            taskId: version.taskId,
            taskName: version.name,
            completionId: ref.id,
            periodKey: period.key,
            createdAt: serverTimestamp(),
            readAt: null,
          })
        }
        await chunk.commit()
      }
    } catch (e) {
      // Already-notified recipients make the whole chunk fail (create-only rule); that is expected on redo.
      console.debug('inbox fan-out skipped', e)
    }
    return ref.id
  }

  async function update(groupId: string, completion: Completion, patch: { values?: CompletionValues; note?: string | null }) {
    await updateDoc(doc(db, 'groups', groupId, 'completions', completion.id), { ...patch, updatedAt: serverTimestamp() })
  }

  async function remove(groupId: string, completion: Completion) {
    await updateDoc(doc(db, 'groups', groupId, 'completions', completion.id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }

  return { log, update, remove }
}
