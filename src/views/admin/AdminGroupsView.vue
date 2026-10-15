<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { PhPlus } from '@phosphor-icons/vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'
import { iconFor } from '@/lib/icons'
import AdminNav from '@/components/layout/AdminNav.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { groupBar } from '@/lib/groupColor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const router = useRouter()
const authStore = useAuthStore()
const groupsStore = useGroupsStore()

const open = ref(false)
const name = ref('')
const creating = ref(false)

async function create() {
  if (!name.value.trim()) return
  creating.value = true
  try {
    const ref = await addDoc(collection(db, 'groups'), {
      name: name.value.trim(),
      description: '',
      icon: 'UsersThree',
      color: 'zinc',
      memberIds: [],
      formerMemberIds: [],
      weekStartsOn: 1,
      weekStartLocked: false,
      editWindowDays: 2,
      archivedAt: null,
      createdAt: serverTimestamp(),
      createdBy: authStore.uid,
    })
    open.value = false
    name.value = ''
    router.push({ name: 'admin-group', params: { id: ref.id } })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <PageHeader title="Groups">
      <Button @click="open = true">
        <PhPlus :size="18" weight="bold" />
        New group
      </Button>
    </PageHeader>
    <AdminNav class="mt-4" />

    <p v-if="groupsStore.adminGroups.length === 0" class="mt-4 text-sm text-muted-foreground">No groups yet. Create one, then add members and tasks.</p>
    <ul v-else class="panel row-list mt-4 overflow-hidden">
      <li v-for="g in groupsStore.adminGroups" :key="g.id">
        <RouterLink :to="{ name: 'admin-group', params: { id: g.id } }" class="flex items-center gap-3 py-3 pr-4 transition-colors hover:bg-accent/50">
          <span class="h-9 w-1.5 rounded-r-full" :class="groupBar(g.color)" />
          <component :is="iconFor(g.icon)" :size="24" class="text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{{ g.name }}</span>
              <Badge v-if="g.archivedAt" variant="outline">Archived</Badge>
            </div>
            <div class="text-sm text-muted-foreground">{{ g.memberIds.length }} member{{ g.memberIds.length === 1 ? '' : 's' }}</div>
          </div>
        </RouterLink>
      </li>
    </ul>

    <Dialog v-model:open="open">
      <DialogContent>
        <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
        <form id="new-group" class="grid gap-1.5" @submit.prevent="create">
          <Label for="group-name">Name</Label>
          <Input id="group-name" v-model="name" placeholder="Fall Shred Crew" maxlength="80" autofocus />
        </form>
        <DialogFooter>
          <Button type="submit" form="new-group" :disabled="creating || !name.trim()">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
