<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useGroup } from '@/composables/useGroup'
import type { Cadence } from '@/types/task'
import type { NotificationPrefs } from '@/types/group'
import { DEFAULT_PREFS } from '@/lib/notifications'
import GroupHeader from '@/components/groups/GroupHeader.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const route = useRoute()
const authStore = useAuthStore()
const groupId = computed(() => String(route.params.id))
const { group, members, latest, today } = useGroup(groupId)

const mine = computed(() => members.value.find((m) => m.id === authStore.uid) ?? null)
const prefs = ref<NotificationPrefs>(structuredClone(DEFAULT_PREFS))
watchEffect(() => {
  if (mine.value?.notifications) prefs.value = structuredClone(mine.value.notifications)
})

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'daily', label: 'Daily tasks' },
  { value: 'weekly', label: 'Weekly tasks' },
  { value: 'monthly', label: 'Monthly tasks' },
]
function toggleCadence(c: Cadence, on: boolean) {
  const set = new Set(prefs.value.onMemberCompletion.cadences)
  if (on) set.add(c)
  else set.delete(c)
  prefs.value.onMemberCompletion.cadences = CADENCES.map((x) => x.value).filter((x) => set.has(x))
}
const allTasks = computed({
  get: () => prefs.value.onMemberCompletion.taskIds === null,
  set: (v) => (prefs.value.onMemberCompletion.taskIds = v ? null : activeTasks.value.map((t) => t.taskId)),
})
const activeTasks = computed(() => latest.value.filter((v) => !v.effectiveTo || v.effectiveTo >= today.value))
function toggleTask(taskId: string, on: boolean) {
  const cur = prefs.value.onMemberCompletion.taskIds ?? []
  prefs.value.onMemberCompletion.taskIds = on ? [...new Set([...cur, taskId])] : cur.filter((t) => t !== taskId)
}

const saving = ref(false)
const saved = ref(false)
async function save() {
  if (!authStore.uid) return
  saving.value = true
  saved.value = false
  try {
    await updateDoc(doc(db, 'groups', groupId.value, 'members', authStore.uid), { notifications: prefs.value })
    saved.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <GroupHeader v-if="group" :group="group" current="settings" />

    <form v-if="group && mine" class="mt-6 grid gap-4" @submit.prevent="save">
      <div class="panel flex items-center justify-between gap-4 p-4">
        <div>
          <Label for="n-enabled" class="text-base font-semibold">Tell me when someone completes a task</Label>
          <p class="mt-1 text-sm text-muted-foreground">Goes to your inbox. Alerts arrive while the app is open.</p>
        </div>
        <Switch id="n-enabled" :model-value="prefs.onMemberCompletion.enabled" @update:model-value="prefs.onMemberCompletion.enabled = $event" />
      </div>

      <template v-if="prefs.onMemberCompletion.enabled">
        <fieldset class="panel grid gap-3 p-4">
          <legend class="sr-only">Which cadences</legend>
          <p class="font-semibold">Which cadences</p>
          <div v-for="c in CADENCES" :key="c.value" class="flex items-center justify-between">
            <Label :for="`n-${c.value}`">{{ c.label }}</Label>
            <Switch :id="`n-${c.value}`" :model-value="prefs.onMemberCompletion.cadences.includes(c.value)" @update:model-value="toggleCadence(c.value, $event)" />
          </div>
        </fieldset>

        <fieldset class="panel grid gap-3 p-4">
          <legend class="sr-only">Which tasks</legend>
          <p class="font-semibold">Which tasks</p>
          <div class="flex items-center justify-between">
            <Label for="n-all">All tasks</Label>
            <Switch id="n-all" :model-value="allTasks" @update:model-value="allTasks = $event" />
          </div>
          <template v-if="!allTasks">
            <div v-for="t in activeTasks" :key="t.taskId" class="flex items-center justify-between">
              <Label :for="`n-t-${t.taskId}`">{{ t.name }}</Label>
              <Switch :id="`n-t-${t.taskId}`" :model-value="prefs.onMemberCompletion.taskIds?.includes(t.taskId) ?? false" @update:model-value="toggleTask(t.taskId, $event)" />
            </div>
          </template>
        </fieldset>
      </template>

      <div class="flex items-center gap-3">
        <Button type="submit" :disabled="saving">Save changes</Button>
        <span v-if="saved" class="text-sm text-muted-foreground">Saved</span>
      </div>
    </form>
  </section>
</template>
