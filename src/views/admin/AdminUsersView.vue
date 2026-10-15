<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Timestamp,
  collection,
  doc,
  setDoc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { PhCopy, PhPlus } from '@phosphor-icons/vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { generateInviteToken, inviteExpiry, inviteUrl, isValidEmail, normalizeEmail } from '@/lib/invites'
import type { Invite, UserProfile } from '@/types/user'
import AdminNav from '@/components/layout/AdminNav.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const authStore = useAuthStore()
const origin = location.origin

const users = useCollection<UserProfile>(query(collection(db, 'users'), orderBy('displayName')))
const invites = useCollection<Invite>(
  query(collection(db, 'invites'), where('status', '==', 'pending'), orderBy('createdAt', 'desc')),
)

// ---- invite dialog ----
const inviteOpen = ref(false)
const inviteEmail = ref('')
const inviteError = ref<string | null>(null)
const createdLink = ref<string | null>(null)
const creating = ref(false)

function openInvite() {
  inviteEmail.value = ''
  inviteError.value = null
  createdLink.value = null
  inviteOpen.value = true
}

async function createInvite() {
  const email = normalizeEmail(inviteEmail.value)
  if (!isValidEmail(email)) {
    inviteError.value = 'Enter a valid email address.'
    return
  }
  if (users.value.some((u) => u.email === email)) {
    inviteError.value = 'That address already has an account.'
    return
  }
  creating.value = true
  inviteError.value = null
  try {
    const token = generateInviteToken()
    await setDoc(doc(db, 'invites', token), {
      email,
      invitedBy: authStore.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(inviteExpiry()),
    })
    createdLink.value = inviteUrl(origin, token)
  } catch (e) {
    inviteError.value = (e as Error).message
  } finally {
    creating.value = false
  }
}

const copied = ref<string | null>(null)
async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = text
  setTimeout(() => (copied.value = null), 1500)
}

async function revoke(invite: Invite) {
  await updateDoc(doc(db, 'invites', invite.id), { status: 'revoked' })
}

// ---- user actions ----
const busyUser = ref<string | null>(null)
async function setRole(u: UserProfile, role: UserProfile['role']) {
  busyUser.value = u.id
  try {
    await updateDoc(doc(db, 'users', u.id), { role, updatedAt: serverTimestamp() })
  } finally {
    busyUser.value = null
  }
}
async function setStatus(u: UserProfile, status: UserProfile['status']) {
  busyUser.value = u.id
  try {
    await updateDoc(doc(db, 'users', u.id), { status, updatedAt: serverTimestamp() })
  } finally {
    busyUser.value = null
  }
}

const activeAdmins = computed(() => users.value.filter((u) => u.role === 'admin' && u.status === 'active').length)
function isLastAdmin(u: UserProfile) {
  return u.role === 'admin' && u.status === 'active' && activeAdmins.value <= 1
}

function expiresIn(invite: Invite): string {
  const days = Math.ceil((invite.expiresAt.toMillis() - Date.now()) / 86_400_000)
  return days <= 0 ? 'expired' : `expires in ${days} day${days === 1 ? '' : 's'}`
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <PageHeader title="People">
      <Button @click="openInvite">
        <PhPlus :size="18" weight="bold" />
        Invite
      </Button>
    </PageHeader>
    <AdminNav class="mt-4" />

    <ul class="panel row-list mt-4 overflow-hidden">
      <li v-for="u in users" :key="u.id" class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium">{{ u.displayName }}</span>
            <Badge v-if="u.role === 'admin'" variant="secondary">Admin</Badge>
            <Badge v-if="u.status === 'deactivated'" variant="outline">Deactivated</Badge>
          </div>
          <div class="truncate text-sm text-muted-foreground">{{ u.email }}</div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-1.5">
          <Button
            v-if="u.role === 'admin'"
            size="sm"
            variant="outline"
            :disabled="busyUser === u.id || isLastAdmin(u)"
            :title="isLastAdmin(u) ? 'The last admin cannot be demoted' : ''"
            @click="setRole(u, 'user')"
          >
            Remove admin
          </Button>
          <Button v-else size="sm" variant="outline" :disabled="busyUser === u.id" @click="setRole(u, 'admin')">
            Make admin
          </Button>
          <Button
            v-if="u.status === 'active'"
            size="sm"
            variant="outline"
            :disabled="busyUser === u.id || isLastAdmin(u) || u.id === authStore.uid"
            @click="setStatus(u, 'deactivated')"
          >
            Deactivate
          </Button>
          <Button v-else size="sm" variant="outline" :disabled="busyUser === u.id" @click="setStatus(u, 'active')">
            Reactivate
          </Button>
        </div>
      </li>
    </ul>

    <h2 class="mt-8 text-xl">Pending invites</h2>
    <p v-if="invites.length === 0" class="mt-2 text-sm text-muted-foreground">No pending invites. Invite someone with the button above.</p>
    <ul v-else class="panel row-list mt-3 overflow-hidden">
      <li v-for="inv in invites" :key="inv.id" class="flex items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">{{ inv.email }}</div>
          <div class="text-sm text-muted-foreground">{{ expiresIn(inv) }}</div>
        </div>
        <Button size="sm" variant="outline" @click="copy(inviteUrl(origin, inv.id))">
          <PhCopy :size="16" />
          {{ copied === inviteUrl(origin, inv.id) ? 'Copied' : 'Copy link' }}
        </Button>
        <Button size="sm" variant="ghost" class="text-destructive" @click="revoke(inv)">Revoke</Button>
      </li>
    </ul>

    <Dialog v-model:open="inviteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            They'll need to sign in with this exact email address. You send them the link yourself.
          </DialogDescription>
        </DialogHeader>

        <form v-if="!createdLink" id="invite-form" class="grid gap-3" @submit.prevent="createInvite">
          <div class="grid gap-1.5">
            <Label for="invite-email">Email</Label>
            <Input id="invite-email" v-model="inviteEmail" type="email" inputmode="email" autofocus />
          </div>
          <Alert v-if="inviteError" variant="destructive">
            <AlertDescription>{{ inviteError }}</AlertDescription>
          </Alert>
        </form>

        <div v-else class="grid gap-3">
          <Label>Invite link</Label>
          <div class="flex gap-2">
            <Input :model-value="createdLink" readonly class="font-mono text-xs" />
            <Button variant="outline" @click="copy(createdLink!)">
              <PhCopy :size="16" />
              {{ copied === createdLink ? 'Copied' : 'Copy' }}
            </Button>
          </div>
          <p class="text-sm text-muted-foreground">Valid for 14 days, single use.</p>
        </div>

        <DialogFooter>
          <Button v-if="!createdLink" type="submit" form="invite-form" :disabled="creating">Create invite</Button>
          <Button v-else @click="inviteOpen = false">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
