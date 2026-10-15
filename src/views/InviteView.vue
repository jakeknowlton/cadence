<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/firebase'
import { acceptInvite } from '@/lib/acceptInvite'
import { browserTimezone } from '@/lib/invites'
import { useAuthStore } from '@/stores/auth'
import SignInButtons from '@/components/auth/SignInButtons.vue'
import CadenceMark from '@/components/brand/CadenceMark.vue'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const buttons = ref<InstanceType<typeof SignInButtons> | null>(null)

const token = computed(() => String(route.params.token ?? ''))
const accepting = ref(false)
const error = ref<string | null>(null)

async function accept() {
  const user = authStore.firebaseUser
  if (!user) return
  accepting.value = true
  error.value = null
  try {
    await acceptInvite(db, user, token.value, browserTimezone())
    await authStore.ready()
    router.replace({ name: 'today' })
  } catch (e) {
    error.value = (e as Error).message || 'Could not accept this invite.'
  } finally {
    accepting.value = false
  }
}

async function onSignedIn() {
  await authStore.ready()
  if (authStore.hasProfile) {
    router.replace(authStore.isActive ? { name: 'today' } : { name: 'no-access' })
    return
  }
  await accept()
}

async function signOut() {
  await authStore.signOut()
  error.value = null
}

onMounted(async () => {
  await authStore.ready()
  if (await buttons.value?.completeEmailLink()) return
  if (authStore.isSignedIn && !authStore.hasProfile) await accept()
})
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-5 py-12">
    <div class="flex flex-col items-start gap-4">
      <CadenceMark :size="48" class="text-primary" />
      <div>
        <h1 class="text-[2rem] leading-tight">You're invited to Cadence</h1>
        <p class="mt-2 text-muted-foreground">Sign in with the email address this invite was sent to.</p>
      </div>
    </div>

    <template v-if="!authStore.isSignedIn">
      <SignInButtons ref="buttons" :continue-path="route.fullPath" @signed-in="onSignedIn" />
    </template>

    <template v-else-if="authStore.hasProfile">
      <p class="text-muted-foreground">You already have an account.</p>
      <Button size="lg" @click="router.replace({ name: 'today' })">Open Cadence</Button>
    </template>

    <template v-else>
      <p v-if="accepting" class="text-muted-foreground">Setting up your account…</p>
      <Alert v-if="error" variant="destructive">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
      <div v-if="error" class="flex flex-col gap-2">
        <Button size="lg" :disabled="accepting" @click="accept">Try again</Button>
        <Button size="lg" variant="outline" :disabled="accepting" @click="signOut">
          Sign out and use a different address
        </Button>
      </div>
    </template>
  </main>
</template>
