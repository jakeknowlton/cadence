<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useInboxStore } from '@/stores/inbox'
import type { InboxItem } from '@/types/notification'
import { parsePeriodKey } from '@/lib/periods'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { PhBell } from '@phosphor-icons/vue'

const inbox = useInboxStore()
const router = useRouter()

function describe(i: InboxItem) {
  const p = parsePeriodKey(i.periodKey)
  const when = p.cadence === 'daily' ? p.start : p.cadence === 'weekly' ? `week of ${p.start}` : p.start.slice(0, 7)
  return `${i.actorName} completed ${i.taskName} (${when})`
}
function ago(i: InboxItem) {
  const ms = Date.now() - i.createdAt.toMillis()
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}
async function open(i: InboxItem) {
  if (!i.readAt) await inbox.markRead([i.id])
  router.push({ name: 'group', params: { id: i.groupId } })
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <PageHeader title="Inbox" :subtitle="inbox.unreadCount ? `${inbox.unreadCount} unread` : undefined">
      <Button v-if="inbox.unreadCount" variant="ghost" size="sm" @click="inbox.markAllRead()">Mark all read</Button>
    </PageHeader>
    <EmptyState
      v-if="inbox.items.length === 0"
      class="mt-5"
      :icon="PhBell"
      title="Nothing here yet"
      body="Turn on alerts in a group to see when others complete tasks. They arrive while the app is open."
    />
    <ul v-else class="panel row-list mt-5 overflow-hidden">
      <li v-for="i in inbox.items" :key="i.id">
        <button type="button" class="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50" @click="open(i)">
          <span class="mt-[0.45rem] size-2 shrink-0 rounded-full" :class="i.readAt ? 'bg-transparent' : 'bg-primary'" />
          <span class="min-w-0 flex-1 text-[0.95rem]" :class="i.readAt ? 'text-muted-foreground' : 'font-medium'">{{ describe(i) }}</span>
          <span class="tabular shrink-0 text-xs text-muted-foreground">{{ ago(i) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
