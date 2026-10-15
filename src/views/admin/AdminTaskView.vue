<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { PhArrowLeft } from '@phosphor-icons/vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useGroup } from '@/composables/useGroup'
import type { TaskDefinition } from '@/types/task'
import type { EditClassification } from '@/lib/taskEdits'
import { periodFor, shiftDays, type DateString } from '@/lib/periods'
import { cosmeticPatch, definitionOf, lineageFieldTypes, newTaskVersion, nextTaskVersion } from '@/lib/versions'
import TaskEditor from '@/components/tasks/TaskEditor.vue'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const groupId = computed(() => String(route.params.id))
const taskId = computed(() => (route.params.taskId ? String(route.params.taskId) : null))
const { group, versions, latest, today } = useGroup(groupId)

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

async function retire() {
  if (!current.value || !group.value) return
  const end = periodFor(today.value, current.value.cadence, group.value.weekStartsOn).end
  await updateDoc(doc(db, 'groups', groupId.value, 'taskVersions', current.value.id), { effectiveTo: end, updatedAt: serverTimestamp() })
  back()
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <button type="button" class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground" @click="back">
      <PhArrowLeft :size="16" /> {{ group?.name ?? 'Group' }}
    </button>
    <h1 class="mt-3 text-[1.75rem] leading-tight">{{ current ? current.name : 'New task' }}</h1>

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
      <Button v-if="!current.effectiveTo" variant="outline" class="mt-4" @click="retire">Retire task</Button>
    </div>
  </section>
</template>
