import { computed } from 'vue'
import { defineStore } from 'pinia'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/firebase'
import { useAuthStore } from './auth'
import type { Group } from '@/types/group'

export const useGroupsStore = defineStore('groups', () => {
  const authStore = useAuthStore()

  // Groups I'm an active member of (array-contains + archivedAt == null needs a composite index in prod).
  const myGroupsQuery = computed(() =>
    authStore.uid && authStore.isActive
      ? query(collection(db, 'groups'), where('memberIds', 'array-contains', authStore.uid), orderBy('name'))
      : null,
  )
  const allGroups = useCollection<Group>(myGroupsQuery)
  const myGroups = computed(() => allGroups.value.filter((g) => !g.archivedAt))

  // Every group, for admins.
  const adminQuery = computed(() => (authStore.isAdmin ? query(collection(db, 'groups'), orderBy('name')) : null))
  const adminGroups = useCollection<Group>(adminQuery)

  return { myGroups, adminGroups, myGroupsPending: allGroups.pending }
})
