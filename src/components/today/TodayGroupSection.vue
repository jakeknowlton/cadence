<script setup lang="ts">
import { computed, ref } from 'vue'
import { collection, query, where } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useGroup } from '@/composables/useGroup'
import { useLogCompletion } from '@/composables/useLogCompletion'
import type { TaskVersionDoc } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'
import { currentPeriodKeys, isActiveDay, isWithinEditWindow, periodFor, type DateString } from '@/lib/periods'
import { periodStatus, quickValues } from '@/lib/completionStatus'
import { versionsInEffect } from '@/lib/versions'
import { iconFor } from '@/lib/icons'
import { groupBar } from '@/lib/groupColor'
import { watchEffect } from 'vue'
import TaskRow from './TaskRow.vue'
import CompletionSheet from './CompletionSheet.vue'

const props = defineProps<{ groupId: string; date: DateString }>()
const emit = defineEmits<{ summary: [groupId: string, beats: { id: string; done: boolean }[]] }>()

const authStore = useAuthStore()
const { group, members, versions, today } = useGroup(() => props.groupId)
const { log, update, remove } = useLogCompletion()

const keys = computed(() => (group.value ? currentPeriodKeys(props.date, group.value.weekStartsOn) : null))
const completions = useCollection<Completion>(
  computed(() =>
    keys.value && authStore.uid
      ? query(
          collection(db, 'groups', props.groupId, 'completions'),
          where('userId', '==', authStore.uid),
          where('periodKey', 'in', Object.values(keys.value)),
        )
      : null,
  ),
)

const tasks = computed(() =>
  versionsInEffect(versions.value, props.date).filter(
    (v) => v.cadence !== 'daily' || isActiveDay(props.date, v.activeDays),
  ),
)
function periodOf(v: TaskVersionDoc) {
  return periodFor(props.date, v.cadence, group.value!.weekStartsOn)
}
function completionsFor(v: TaskVersionDoc) {
  const key = periodOf(v).key
  return completions.value.filter((c) => c.taskId === v.taskId && c.periodKey === key && !c.deletedAt)
}
function statusOf(v: TaskVersionDoc) {
  return periodStatus(v.snapshot, completionsFor(v))
}
function editableFor(v: TaskVersionDoc) {
  return !!group.value && !group.value.archivedAt && isWithinEditWindow(periodOf(v), today.value, group.value.editWindowDays)
}

watchEffect(() => {
  emit('summary', props.groupId, tasks.value.map((v) => ({ id: v.id, done: statusOf(v).complete })))
})

const busy = ref<string | null>(null)
const sheetOpen = ref(false)
const sheetTask = ref<TaskVersionDoc | null>(null)

async function toggle(v: TaskVersionDoc) {
  if (!group.value) return
  const status = statusOf(v)
  // A field task logs in one tap when every required field has a default; otherwise it needs the sheet.
  const values = v.completionType === 'fields' ? quickValues(v.snapshot) : {}
  if (!values && !status.complete) {
    openSheet(v)
    return
  }
  busy.value = v.taskId
  try {
    if (status.complete && v.requiredCount === 1) {
      const latest = completionsFor(v).at(-1)
      if (latest) await remove(group.value.id, latest)
    } else if (status.complete) {
      openSheet(v)
    } else {
      await log(group.value, v, periodOf(v), { values: values ?? {}, members: members.value, completedAt: completedAtFor() })
    }
  } finally {
    busy.value = null
  }
}
function openSheet(v: TaskVersionDoc) {
  sheetTask.value = v
  sheetOpen.value = true
}
/** Logging for a past day stamps that day at noon so it lands in the right period and inside the rules' time bound. */
function completedAtFor(): Date | undefined {
  if (props.date === today.value) return undefined
  return new Date(`${props.date}T12:00:00`)
}
async function onSave(values: CompletionValues, note: string | null, editing: Completion | null) {
  const v = sheetTask.value
  if (!v || !group.value) return
  busy.value = v.taskId
  try {
    if (editing) await update(group.value.id, editing, { values, note })
    else await log(group.value, v, periodOf(v), { values, note, members: members.value, completedAt: completedAtFor() })
    sheetOpen.value = false
  } finally {
    busy.value = null
  }
}
async function onRemove(c: Completion) {
  if (group.value) await remove(group.value.id, c)
}
const sheetExisting = computed(() => (sheetTask.value ? completionsFor(sheetTask.value) : []))
const periodLabel = computed(() => {
  if (!sheetTask.value || !group.value) return ''
  const p = periodOf(sheetTask.value)
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, opts)
  if (p.cadence === 'daily') return fmt(p.start, { weekday: 'long', month: 'long', day: 'numeric' })
  if (p.cadence === 'weekly') return `Week of ${fmt(p.start, { month: 'short', day: 'numeric' })}`
  return fmt(p.start, { month: 'long', year: 'numeric' })
})
</script>

<template>
  <section v-if="group && tasks.length" class="panel overflow-hidden">
    <RouterLink :to="{ name: 'group', params: { id: group.id } }" class="flex items-center gap-2.5 px-4 pt-3 pb-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
      <span class="h-4 w-1 rounded-full" :class="groupBar(group.color)" />
      <component :is="iconFor(group.icon)" :size="16" />
      {{ group.name }}
    </RouterLink>
    <ul class="row-list pb-1.5">
      <TaskRow
        v-for="v in tasks"
        :key="v.id"
        :version="v"
        :status="statusOf(v)"
        :editable="editableFor(v)"
        :busy="busy === v.taskId"
        @toggle="toggle(v)"
        @open="openSheet(v)"
      />
    </ul>
    <CompletionSheet
      v-model:open="sheetOpen"
      :version="sheetTask"
      :existing="sheetExisting"
      :editable="sheetTask ? editableFor(sheetTask) : false"
      :period-label="periodLabel"
      :saving="busy !== null"
      @save="onSave"
      @remove="onRemove"
    />
  </section>
</template>
