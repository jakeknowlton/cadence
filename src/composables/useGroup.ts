import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { collection, doc, orderBy, query } from 'firebase/firestore'
import { useCollection, useDocument } from 'vuefire'
import { db } from '@/firebase'
import type { Group, Membership, TaskVersionDoc } from '@/types/group'
import type { UserProfile } from '@/types/user'
import { latestVersions, versionsInEffect } from '@/lib/versions'
import { useAuthStore } from '@/stores/auth'
import { useToday } from './useToday'

/**
 * Live bindings for one group: doc, roster, task versions, and derived views.
 * Archived tasks are left out unless `includeArchived` is set, which only admin screens do.
 */
export function useGroup(groupId: MaybeRefOrGetter<string | null | undefined>, opts: { includeArchived?: boolean } = {}) {
  const id = computed(() => toValue(groupId) || null)
  const group = useDocument<Group>(computed(() => (id.value ? doc(db, 'groups', id.value) : null)))
  const members = useCollection<Membership>(
    computed(() => (id.value ? collection(db, 'groups', id.value, 'members') : null)),
  )
  const allVersions = useCollection<TaskVersionDoc>(
    computed(() =>
      id.value ? query(collection(db, 'groups', id.value, 'taskVersions'), orderBy('version')) : null,
    ),
  )
  const { today } = useToday()
  const authStore = useAuthStore()

  const archivedTaskIds = computed(() => new Set(group.value?.archivedTaskIds ?? []))
  const isTaskArchived = (taskId: string) => archivedTaskIds.value.has(taskId)
  const versions = computed(() => (opts.includeArchived ? allVersions.value : allVersions.value.filter((v) => !isTaskArchived(v.taskId))))
  /** An archived group is visible to admins only. */
  const hidden = computed(() => !!group.value?.archivedAt && !authStore.isAdmin)

  const activeMembers = computed(() => members.value.filter((m) => m.leftAt === null))
  const tasksToday = computed(() => versionsInEffect(versions.value, today.value))
  const latest = computed(() => latestVersions(versions.value))

  return { id, group, members, activeMembers, versions, tasksToday, latest, today, isTaskArchived, hidden }
}

/** Profiles for a list of user ids, keyed by id. */
export function useProfiles(uids: MaybeRefOrGetter<string[]>) {
  const list = computed(() => toValue(uids))
  // One doc binding per user keeps rules simple (any active user may read any profile).
  const docs = useCollection<UserProfile>(
    computed(() => (list.value.length ? query(collection(db, 'users'), orderBy('displayName')) : null)),
  )
  const byId = computed(() => {
    const map = new Map<string, UserProfile>()
    for (const p of docs.value) if (list.value.includes(p.id)) map.set(p.id, p)
    return map
  })
  const nameOf = (uid: string) => byId.value.get(uid)?.displayName ?? '…'
  return { profiles: docs, byId, nameOf }
}
