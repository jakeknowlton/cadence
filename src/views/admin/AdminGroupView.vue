<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { arrayRemove, arrayUnion, collection, doc, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { PhPlus, PhArrowLeft } from '@phosphor-icons/vue'
import { db } from '@/firebase'
import { useGroup, useProfiles } from '@/composables/useGroup'
import { iconFor } from '@/lib/icons'
import { DEFAULT_PREFS } from '@/lib/notifications'
import { isRetired } from '@/lib/versions'
import { GROUP_COLORS } from '@/types/group'
import type { UserProfile } from '@/types/user'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import NativeSelect from '@/components/ui/NativeSelect.vue'
import IconPicker from '@/components/tasks/IconPicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { groupBar } from '@/lib/groupColor'

const route = useRoute()
const router = useRouter()
const groupId = computed(() => String(route.params.id))
const { group, members, activeMembers, latest, today } = useGroup(groupId)
const { nameOf } = useProfiles(() => activeMembers.value.map((m) => m.userId))

type Tab = 'tasks' | 'members' | 'settings'
const tab = ref<Tab>((route.query.tab as Tab) || 'tasks')
watchEffect(() => router.replace({ query: { ...route.query, tab: tab.value } }))

// ---- settings ----
const form = ref({ name: '', description: '', icon: 'UsersThree', color: 'zinc', weekStartsOn: 1 as 0 | 1, editWindowDays: 2 })
watchEffect(() => {
  if (group.value) {
    form.value = {
      name: group.value.name, description: group.value.description ?? '', icon: group.value.icon, color: group.value.color,
      weekStartsOn: group.value.weekStartsOn, editWindowDays: group.value.editWindowDays,
    }
  }
})
const saving = ref(false)
async function saveSettings() {
  saving.value = true
  try {
    await updateDoc(doc(db, 'groups', groupId.value), { ...form.value, editWindowDays: Number(form.value.editWindowDays) })
  } finally {
    saving.value = false
  }
}
async function setArchived(archived: boolean) {
  await updateDoc(doc(db, 'groups', groupId.value), { archivedAt: archived ? serverTimestamp() : null })
}

// ---- members ----
const allUsers = useCollection<UserProfile>(query(collection(db, 'users'), orderBy('displayName')))
const candidates = computed(() =>
  allUsers.value.filter((u) => u.status === 'active' && !group.value?.memberIds.includes(u.id)),
)
const pick = ref('')
async function addMember() {
  const uid = pick.value
  if (!uid) return
  const batch = writeBatch(db)
  batch.update(doc(db, 'groups', groupId.value), { memberIds: arrayUnion(uid), formerMemberIds: arrayRemove(uid) })
  const existing = members.value.find((m) => m.id === uid)
  if (existing) {
    batch.update(doc(db, 'groups', groupId.value, 'members', uid), { leftAt: null })
  } else {
    batch.set(doc(db, 'groups', groupId.value, 'members', uid), {
      userId: uid, joinedAt: serverTimestamp(), leftAt: null, notifications: DEFAULT_PREFS,
    })
  }
  await batch.commit()
  pick.value = ''
}
async function removeMember(uid: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'groups', groupId.value), { memberIds: arrayRemove(uid), formerMemberIds: arrayUnion(uid) })
  batch.update(doc(db, 'groups', groupId.value, 'members', uid), { leftAt: serverTimestamp() })
  await batch.commit()
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <RouterLink :to="{ name: 'admin-groups' }" class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
      <PhArrowLeft :size="16" /> Groups
    </RouterLink>
    <div v-if="group" class="mt-3 flex items-center gap-3">
      <span class="h-8 w-1.5 rounded-full" :class="groupBar(group.color)" />
      <component :is="iconFor(group.icon)" :size="26" class="text-muted-foreground" />
      <h1 class="min-w-0 flex-1 truncate text-[1.75rem] leading-tight">{{ group.name }}</h1>
      <Badge v-if="group.archivedAt" variant="outline">Archived</Badge>
    </div>

    <SegmentedControl v-model="tab" class="mt-4" :options="[{ value: 'tasks', label: 'Tasks' }, { value: 'members', label: 'Members' }, { value: 'settings', label: 'Settings' }]" label="Group admin" grow />

    <!-- Tasks -->
    <div v-if="tab === 'tasks'" class="mt-4">
      <div class="flex justify-end">
        <Button size="sm" @click="router.push({ name: 'admin-task-new', params: { id: groupId } })">
          <PhPlus :size="16" weight="bold" /> New task
        </Button>
      </div>
      <p v-if="latest.length === 0" class="mt-3 text-sm text-muted-foreground">No tasks yet. Add the first one with the button above.</p>
      <ul v-else class="panel row-list mt-3 overflow-hidden">
        <li v-for="v in latest" :key="v.taskId">
          <RouterLink
            :to="{ name: 'admin-task-edit', params: { id: groupId, taskId: v.taskId } }"
            class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
            :class="isRetired(v, today) ? 'opacity-60' : ''"
          >
            <component :is="iconFor(v.icon)" :size="22" class="text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ v.name }}</span>
                <Badge v-if="isRetired(v, today)" variant="outline">Retired</Badge>
                <Badge v-else-if="v.effectiveFrom > today" variant="secondary">From {{ v.effectiveFrom }}</Badge>
              </div>
              <div class="text-sm text-muted-foreground">
                <span class="capitalize">{{ v.cadence }}</span><span v-if="v.requiredCount > 1">, {{ v.requiredCount }} times</span>,
                {{ v.completionType === 'checkbox' ? 'check-off' : `${v.fields.length} field${v.fields.length === 1 ? '' : 's'}` }}<span v-if="v.version > 1">, version {{ v.version }}</span>
              </div>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>

    <!-- Members -->
    <div v-else-if="tab === 'members'" class="mt-4 grid gap-4">
      <div class="flex gap-2">
        <NativeSelect v-model="pick" :options="[{ value: '', label: 'Add a member…' }, ...candidates.map((u) => ({ value: u.id, label: `${u.displayName} (${u.email})` }))]" />
        <Button :disabled="!pick" @click="addMember">Add</Button>
      </div>
      <ul class="panel row-list overflow-hidden">
        <li v-for="m in activeMembers" :key="m.id" class="flex items-center gap-3 px-4 py-3">
          <span class="flex-1 truncate font-medium">{{ nameOf(m.userId) }}</span>
          <Button size="sm" variant="ghost" @click="removeMember(m.userId)">Remove</Button>
        </li>
        <li v-if="activeMembers.length === 0" class="px-4 py-3 text-sm text-muted-foreground">No members yet. Pick someone above.</li>
      </ul>
    </div>

    <!-- Settings -->
    <form v-else-if="group" class="panel mt-4 grid gap-5 p-5" @submit.prevent="saveSettings">
      <div class="grid gap-1.5">
        <Label for="g-name">Name</Label>
        <Input id="g-name" v-model="form.name" maxlength="80" />
      </div>
      <div class="grid gap-1.5">
        <Label for="g-desc">Description</Label>
        <Input id="g-desc" v-model="form.description" maxlength="200" />
      </div>
      <div class="grid gap-1.5">
        <Label>Icon</Label>
        <IconPicker v-model="form.icon" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="grid gap-1.5">
          <Label for="g-color">Colour</Label>
          <NativeSelect id="g-color" v-model="form.color" :options="GROUP_COLORS.map((c) => ({ value: c, label: c }))" />
        </div>
        <div class="grid gap-1.5">
          <Label for="g-edit">Edit window (days)</Label>
          <Input id="g-edit" v-model.number="form.editWindowDays" type="number" inputmode="numeric" min="0" max="30" />
        </div>
      </div>
      <div class="grid gap-1.5">
        <Label for="g-week">Week starts on</Label>
        <NativeSelect id="g-week" v-model="form.weekStartsOn" :options="[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]" :disabled="group.weekStartLocked" />
        <p v-if="group.weekStartLocked" class="text-sm text-muted-foreground">Locked: this group already has weekly completions.</p>
      </div>
      <Button type="submit" :disabled="saving">Save changes</Button>

      <div class="mt-2 flex items-center justify-between border-t border-border pt-5">
        <div>
          <Label for="g-archived">Archived</Label>
          <p class="text-sm text-muted-foreground">Read-only and hidden from members’ lists.</p>
        </div>
        <Switch id="g-archived" :model-value="!!group.archivedAt" @update:model-value="setArchived($event)" />
      </div>
    </form>
  </section>
</template>
