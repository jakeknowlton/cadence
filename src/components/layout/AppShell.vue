<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PhBell, PhCheckSquare, PhGear, PhUser, PhUsersThree } from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import { useInboxStore } from '@/stores/inbox'
import CadenceMark from '@/components/brand/CadenceMark.vue'

const route = useRoute()
const auth = useAuthStore()
const inbox = useInboxStore()

const tabs = computed(() => {
  const base = [
    { name: 'today', label: 'Today', to: '/', icon: PhCheckSquare, match: ['today'] },
    { name: 'groups', label: 'Groups', to: '/groups', icon: PhUsersThree, match: ['groups', 'group', 'group-history', 'group-stats', 'group-settings'] },
    { name: 'inbox', label: 'Inbox', to: '/inbox', icon: PhBell, match: ['inbox'] },
    { name: 'me', label: 'Me', to: '/me', icon: PhUser, match: ['me', 'me-history'] },
  ]
  if (auth.isAdmin) base.push({ name: 'admin-users', label: 'Admin', to: '/admin/users', icon: PhGear, match: ['admin-users', 'admin-groups', 'admin-group', 'admin-task-new', 'admin-task-edit'] })
  return base
})
const isActive = (tab: { match: string[] }) => tab.match.includes(String(route.name ?? ''))
const bare = computed(() => route.meta.bare === true)
</script>

<template>
  <div v-if="bare" class="min-h-dvh bg-background text-foreground">
    <slot />
  </div>

  <div v-else class="min-h-dvh bg-background text-foreground md:flex">
    <aside class="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
      <RouterLink to="/" class="flex items-center gap-2.5 px-5 pt-6 pb-5 text-primary">
        <CadenceMark :size="26" />
        <span class="text-[1.15rem] font-extrabold tracking-tight text-foreground">Cadence</span>
      </RouterLink>
      <nav class="flex flex-col gap-0.5 px-3" aria-label="Primary">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="tab.to"
          class="flex h-10 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          :class="isActive(tab) ? 'bg-sidebar-accent text-foreground' : ''"
          :aria-current="isActive(tab) ? 'page' : undefined"
        >
          <span class="relative">
            <component :is="tab.icon" :size="20" :weight="isActive(tab) ? 'fill' : 'regular'" />
            <span v-if="tab.name === 'inbox' && inbox.unreadCount" class="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
          </span>
          {{ tab.label }}
        </RouterLink>
      </nav>
    </aside>

    <main class="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
      <slot />
    </main>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Primary"
    >
      <ul class="flex h-[4.25rem] items-stretch px-1">
        <li v-for="tab in tabs" :key="tab.name" class="flex-1">
          <RouterLink
            :to="tab.to"
            class="flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-medium text-muted-foreground transition-colors"
            :class="isActive(tab) ? 'text-primary' : ''"
            :aria-current="isActive(tab) ? 'page' : undefined"
          >
            <span class="relative">
              <component :is="tab.icon" :size="24" :weight="isActive(tab) ? 'fill' : 'regular'" />
              <span
                v-if="tab.name === 'inbox' && inbox.unreadCount"
                class="tabular absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-primary-foreground"
              >{{ inbox.unreadCount }}</span>
            </span>
            {{ tab.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
