<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import CadenceMark from '@/components/brand/CadenceMark.vue'

const authStore = useAuthStore()
const router = useRouter()

async function signOut() {
  await authStore.signOut()
  router.replace({ name: 'login' })
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-12">
    <CadenceMark :size="48" class="text-muted-foreground" />
    <h1 class="text-[2rem] leading-tight">You need an invite</h1>
    <p v-if="authStore.profile?.status === 'deactivated'" class="text-muted-foreground">
      This account has been deactivated. Contact your group admin if you think that's a mistake.
    </p>
    <p v-else-if="authStore.firebaseUser && !authStore.firebaseUser.emailVerified" class="text-muted-foreground">
      You're signed in as <span class="font-medium text-foreground">{{ authStore.firebaseUser.email }}</span>. Cadence is
      invite-only: open the invite link you were sent, and it will walk you through verifying this address.
    </p>
    <p v-else class="text-muted-foreground">
      You're signed in as <span class="font-medium text-foreground">{{ authStore.firebaseUser?.email }}</span>, but
      Cadence is invite-only and this address has no account. Ask an admin for an invite link, then open it while
      signed in with this address.
    </p>
    <Button size="lg" variant="outline" class="self-start" @click="signOut">Sign out</Button>
  </main>
</template>
