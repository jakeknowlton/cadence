import { computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, doc, limit, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/firebase'
import { useAuthStore } from './auth'
import { useGroupsStore } from './groups'
import type { InboxItem } from '@/types/notification'

export const useInboxStore = defineStore('inbox', () => {
  const authStore = useAuthStore()
  const groupsStore = useGroupsStore()
  const raw = useCollection<InboxItem>(
    computed(() =>
      authStore.uid && authStore.isActive
        ? query(collection(db, 'notifications', authStore.uid, 'items'), orderBy('createdAt', 'desc'), limit(100))
        : null,
    ),
  )
  const items = computed(() => raw.value.filter((i) => !groupsStore.isHidden(i.groupId, i.taskId)))
  const unread = computed(() => items.value.filter((i) => !i.readAt))
  const unreadCount = computed(() => unread.value.length)

  // App icon badge where supported (installed PWA on Android/desktop; iOS 16.4+ home screen apps).
  watch(unreadCount, (n) => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (n > 0) nav.setAppBadge?.(n).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  })

  async function markRead(ids: string[]) {
    if (!authStore.uid || ids.length === 0) return
    const batch = writeBatch(db)
    for (const id of ids) batch.update(doc(db, 'notifications', authStore.uid, 'items', id), { readAt: serverTimestamp() })
    await batch.commit()
  }
  async function markAllRead() {
    await markRead(unread.value.map((i) => i.id))
  }

  return { items, unread, unreadCount, markRead, markAllRead }
})
