<script setup lang="ts">
import type { Group } from '@/types/group'
import { iconFor } from '@/lib/icons'
import { groupBar } from '@/lib/groupColor'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

defineProps<{ group: Group; current: 'home' | 'history' | 'stats' | 'settings' }>()
const tabs = [
  { key: 'home', label: 'Now', route: 'group' },
  { key: 'history', label: 'History', route: 'group-history' },
  { key: 'stats', label: 'Stats', route: 'group-stats' },
  { key: 'settings', label: 'Alerts', route: 'group-settings' },
] as const
</script>

<template>
  <header>
    <div class="flex items-center gap-3">
      <span class="h-8 w-1.5 rounded-full" :class="groupBar(group.color)" />
      <component :is="iconFor(group.icon)" :size="26" class="text-muted-foreground" />
      <h1 class="min-w-0 flex-1 truncate text-[1.75rem] leading-tight">{{ group.name }}</h1>
      <Badge v-if="group.archivedAt" variant="outline">Archived</Badge>
    </div>
    <Alert v-if="group.archivedAt" class="mt-3">
      <AlertDescription>This group is archived. Only admins can see it.</AlertDescription>
    </Alert>
    <nav class="mt-4 grid grid-cols-4 rounded-lg bg-muted p-0.5 text-sm" aria-label="Group sections">
      <RouterLink
        v-for="t in tabs"
        :key="t.key"
        :to="{ name: t.route, params: { id: group.id } }"
        class="h-8 rounded-[7px] text-center font-medium leading-8 transition-colors"
        :class="current === t.key ? 'bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted-foreground hover:text-foreground'"
        :aria-current="current === t.key ? 'page' : undefined"
      >
        {{ t.label }}
      </RouterLink>
    </nav>
  </header>
</template>
