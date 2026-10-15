<script setup lang="ts">
import { PhCaretRight, PhUsersThree } from '@phosphor-icons/vue'
import { useGroupsStore } from '@/stores/groups'
import { iconFor } from '@/lib/icons'
import { groupBar } from '@/lib/groupColor'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'

const groupsStore = useGroupsStore()
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <PageHeader title="Groups" />
    <EmptyState v-if="!groupsStore.myGroupsPending && groupsStore.myGroups.length === 0" class="mt-5" :icon="PhUsersThree" title="No groups yet" body="An admin adds you to a group." />
    <ul v-else class="mt-5 grid gap-3">
      <li v-for="g in groupsStore.myGroups" :key="g.id">
        <RouterLink :to="{ name: 'group', params: { id: g.id } }" class="panel flex items-center gap-4 overflow-hidden p-4 pl-0 transition-colors hover:bg-accent/40">
          <span class="h-12 w-1.5 shrink-0 rounded-r-full" :class="groupBar(g.color)" />
          <component :is="iconFor(g.icon)" :size="28" class="shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[1.05rem] font-semibold">{{ g.name }}</div>
            <div class="truncate text-sm text-muted-foreground">{{ g.description || `${g.memberIds.length} member${g.memberIds.length === 1 ? '' : 's'}` }}</div>
          </div>
          <PhCaretRight :size="18" class="shrink-0 text-muted-foreground" />
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
