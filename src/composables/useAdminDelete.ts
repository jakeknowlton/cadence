import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentReference,
  type Query,
} from 'firebase/firestore'
import { db } from '@/firebase'
import type { Group, Membership } from '@/types/group'

/** What a delete will remove, shown in the confirmation dialog. */
export interface Footprint {
  tasks: number
  completions: number
  /** distinct members with at least one completion */
  loggers: number
}

// A batch takes at most 500 writes; stay under it.
const CHUNK = 400

async function refsOf(q: Query): Promise<DocumentReference[]> {
  return (await getDocs(q)).docs.map((d) => d.ref)
}

/** Deletes in chunks. Not atomic across chunks, so callers delete the parent document last: a failure leaves it in place to retry. */
async function deleteAll(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref)
    await batch.commit()
  }
}

/** Inbox items live under each recipient, so look through everyone who has ever been in the group. */
async function notificationRefs(group: Group, taskId?: string): Promise<DocumentReference[]> {
  const uids = [...new Set([...group.memberIds, ...group.formerMemberIds])]
  const lists = await Promise.all(
    uids.map((uid) => {
      const items = collection(db, 'notifications', uid, 'items')
      return refsOf(
        taskId
          ? query(items, where('groupId', '==', group.id), where('taskId', '==', taskId))
          : query(items, where('groupId', '==', group.id)),
      )
    }),
  )
  return lists.flat()
}

export function useAdminDelete() {
  async function taskFootprint(groupId: string, taskId: string): Promise<Footprint> {
    const snap = await getDocs(query(collection(db, 'groups', groupId, 'completions'), where('taskId', '==', taskId)))
    return { tasks: 1, completions: snap.size, loggers: new Set(snap.docs.map((d) => d.get('userId'))).size }
  }

  async function groupFootprint(groupId: string): Promise<Footprint> {
    const [completions, versions] = await Promise.all([
      getDocs(collection(db, 'groups', groupId, 'completions')),
      getDocs(collection(db, 'groups', groupId, 'taskVersions')),
    ])
    return {
      tasks: new Set(versions.docs.map((d) => d.get('taskId'))).size,
      completions: completions.size,
      loggers: new Set(completions.docs.map((d) => d.get('userId'))).size,
    }
  }

  /** Removes a task's versions, completions, and inbox items, and drops it from alert preferences. */
  async function deleteTask(group: Group, taskId: string) {
    const groupRef = doc(db, 'groups', group.id)
    const [completions, versions, notifications, members] = await Promise.all([
      refsOf(query(collection(groupRef, 'completions'), where('taskId', '==', taskId))),
      refsOf(query(collection(groupRef, 'taskVersions'), where('taskId', '==', taskId))),
      notificationRefs(group, taskId),
      getDocs(collection(groupRef, 'members')),
    ])
    await deleteAll([...completions, ...notifications])

    const batch = writeBatch(db)
    for (const m of members.docs) {
      const taskIds = (m.data() as Membership).notifications?.onMemberCompletion.taskIds
      if (taskIds?.includes(taskId)) batch.update(m.ref, { 'notifications.onMemberCompletion.taskIds': taskIds.filter((t) => t !== taskId) })
    }
    batch.update(groupRef, { archivedTaskIds: arrayRemove(taskId) })
    await batch.commit()

    await deleteAll(versions)
  }

  /** Removes a group and everything under it, plus its members' inbox items. */
  async function deleteGroup(group: Group) {
    const groupRef = doc(db, 'groups', group.id)
    const [completions, versions, members, notifications] = await Promise.all([
      refsOf(collection(groupRef, 'completions')),
      refsOf(collection(groupRef, 'taskVersions')),
      refsOf(collection(groupRef, 'members')),
      notificationRefs(group),
    ])
    await deleteAll([...completions, ...notifications, ...versions, ...members])
    await deleteAll([groupRef])
  }

  return { taskFootprint, groupFootprint, deleteTask, deleteGroup }
}
