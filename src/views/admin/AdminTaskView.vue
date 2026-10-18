<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { arrayRemove, arrayUnion, collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { PhArrowLeft } from '@phosphor-icons/vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useGroup } from '@/composables/useGroup'
import { useAdminDelete, type Footprint } from '@/composables/useAdminDelete'
import type { TaskDefinition } from '@/types/task'
import type { EditClassification } from '@/lib/taskEdits'
import { shiftDays, type DateString } from '@/lib/periods'
import { cosmeticPatch, definitionOf, lineageFieldTypes, newTaskVersion, nextTaskVersion } from '@/lib/versions'
import TaskEditor from '@/components/tasks/TaskEditor.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmDialog from '@/components/layout/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupId = computed(() => String(route.params.id))
const taskId = computed(() => (route.params.taskId ? String(route.params.taskId) : null))
const { group, versions, latest, today, isTaskArchived } = useGroup(groupId, { includeArchived: true })

const current = computed(() => latest.value.find((v) => v.taskId === taskId.value) ?? null)
const history = computed(() => versions.value.filter((v) => v.taskId === taskId.value).sort((a, b) => b.version - a.version))
const lineage = computed(() => (taskId.value ? lineageFieldTypes(versions.value, taskId.value) : {}))
const blank: TaskDefinition = {
  name: '', sortOrder: 0, cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'checkbox', fields: [],
}
const initial = computed<TaskDefinition>(() =>
  current.value ? definitionOf(current.value) : { ...blank, sortOrder: latest.value.length },
)
const ready = computed(() => !!group.value && (!taskId.value || !!current.value))

const saving = ref(false)
const error = ref<string | null>(null)
const back = () => router.push({ name: 'admin-group', params: { id: groupId.value }, query: { tab: 'tasks' } })

async function onSave(def: TaskDefinition, classification: EditClassification, effectiveFrom: DateString) {
  saving.value = true
  error.value = null
  try {
    const col = collection(db, 'groups', groupId.value, 'taskVersions')
    if (!current.value) {
      const ref = doc(col)
      await setDoc(ref, { ...newTaskVersion(def, { taskId: ref.id, effectiveFrom: today.value, createdBy: authStore.uid! }), createdAt: serverTimestamp() })
    } else if (classification.class === 'cosmetic') {
      await updateDoc(doc(col, current.value.id), { ...cosmeticPatch(def), updatedAt: serverTimestamp() })
    } else if (classification.class === 'measured') {
      const { version, closePrev } = nextTaskVersion(current.value, def, { effectiveFrom, createdBy: authStore.uid!, lineage: lineage.value })
      const batch = writeBatch(db)
      batch.update(doc(col, current.value.id), { ...closePrev, updatedAt: serverTimestamp() })
      batch.set(doc(col), { ...version, createdAt: serverTimestamp() })
      await batch.commit()
    }
    back()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function onReplace(def: TaskDefinition, effectiveFrom: DateString) {
  if (!current.value) return
  saving.value = true
  error.value = null
  try {
    const col = collection(db, 'groups', groupId.value, 'taskVersions')
    const newRef = doc(col)
    const batch = writeBatch(db)
    batch.update(doc(col, current.value.id), { effectiveTo: shiftDays(effectiveFrom, -1), updatedAt: serverTimestamp() })
    batch.set(newRef, {
      ...newTaskVersion(def, { taskId: newRef.id, effectiveFrom, createdBy: authStore.uid!, replaces: current.value.taskId }),
      createdAt: serverTimestamp(),
    })
    await batch.commit()
    back()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

// ---- archive and delete ----
const archived = computed(() => !!taskId.value && isTaskArchived(taskId.value))
const confirmArchive = ref(false)
const confirmDelete = ref(false)
const busy = ref(false)
const actionError = ref<string | null>(null)
const footprint = ref<Footprint | null>(null)
const { taskFootprint, deleteTask } = useAdminDelete()

async function setArchived(on: boolean) {
  if (!taskId.value) return
  busy.value = true
  actionError.value = null
  try {
    await updateDoc(doc(db, 'groups', groupId.value), { archivedTaskIds: on ? arrayUnion(taskId.value) : arrayRemove(taskId.value) })
    confirmArchive.value = false
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function askDelete() {
  actionError.value = null
  footprint.value = null
  confirmDelete.value = true
  if (taskId.value) footprint.value = await taskFootprint(groupId.value, taskId.value)
}
async function remove() {
  if (!group.value || !taskId.value) return
  busy.value = true
  actionError.value = null
  try {
    await deleteTask(group.value, taskId.value)
    confirmDelete.value = false
    back()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <button type="button" class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground" @click="back">
      <PhArrowLeft :size="16" /> {{ group?.name ?? 'Group' }}
    </button>
    <div class="mt-3 flex items-center gap-3">
      <h1 class="min-w-0 flex-1 truncate text-[1.75rem] leading-tight">{{ current ? current.name : 'New task' }}</h1>
      <Badge v-if="archived" variant="outline">Archived</Badge>
    </div>

    <Alert v-if="archived" class="mt-4">
      <AlertDescription class="flex flex-wrap items-center justify-between gap-3">
        <span>Archived. Members can’t see this task or its history.</span>
        <Button size="sm" :disabled="busy" @click="setArchived(false)">Restore task</Button>
      </AlertDescription>
    </Alert>

    <Alert v-if="error" variant="destructive" class="mt-4">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <TaskEditor
      v-if="ready && group"
      class="mt-6"
      :current="current"
      :lineage="lineage"
      :today="today"
      :week-starts-on="group.weekStartsOn"
      :initial="initial"
      :saving="saving"
      @save="onSave"
      @replace="onReplace"
      @cancel="back"
    />

    <div v-if="current" class="mt-10 border-t border-border pt-6">
      <h2 class="text-xl">Versions</h2>
      <ul class="panel row-list mt-3 overflow-hidden text-sm">
        <li v-for="v in history" :key="v.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
          <span><span class="font-semibold">Version {{ v.version }}</span>, <span class="capitalize">{{ v.cadence }}</span><span v-if="v.requiredCount > 1"> {{ v.requiredCount }} times</span></span>
          <span class="tabular text-muted-foreground">{{ v.effectiveFrom }} to {{ v.effectiveTo ?? 'now' }}</span>
        </li>
      </ul>
    </div>

    <div v-if="current" class="mt-10 border-t border-border pt-6">
      <h2 class="text-xl">Archive or delete</h2>
      <div class="panel row-list mt-3 overflow-hidden">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p class="font-medium">{{ archived ? 'Restore task' : 'Archive task' }}</p>
            <p class="text-sm text-muted-foreground">
              {{ archived ? 'Show it to members again, with its history.' : 'Hide it from every member right away. History is kept and you can restore it.' }}
            </p>
          </div>
          <Button v-if="archived" variant="outline" :disabled="busy" @click="setArchived(false)">Restore</Button>
          <Button v-else variant="outline" @click="confirmArchive = true">Archive</Button>
        </div>
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p class="font-medium">Delete task</p>
            <p class="text-sm text-muted-foreground">Remove the task and everything logged against it. Can’t be undone.</p>
          </div>
          <Button variant="destructive" @click="askDelete">Delete</Button>
        </div>
      </div>
    </div>

    <ConfirmDialog v-if="current" v-model:open="confirmArchive" :title="`Archive ${current.name}?`" confirm-label="Archive task" :busy="busy" :error="actionError" @confirm="setArchived(true)">
      <p>It disappears for every member right away: Today, the group page, history, stats, and alerts.</p>
      <p>Its history is kept, and you can restore it from the group’s Archived list.</p>
    </ConfirmDialog>
    <ConfirmDialog
      v-if="current"
      v-model:open="confirmDelete"
      :title="`Delete ${current.name}?`"
      confirm-label="Delete forever"
      destructive
      :confirm-text="current.name"
      :busy="busy"
      :error="actionError"
      @confirm="remove"
    >
      <p v-if="footprint">
        This permanently deletes the task, all {{ footprint.completions }} completion{{ footprint.completions === 1 ? '' : 's' }}
        from {{ footprint.loggers }} member{{ footprint.loggers === 1 ? '' : 's' }}, and the alerts about it.
      </p>
      <p v-else>Counting what will be deleted…</p>
      <p class="font-semibold text-foreground">This can’t be undone. To keep the history, archive the task instead.</p>
    </ConfirmDialog>
  </section>
</template>
