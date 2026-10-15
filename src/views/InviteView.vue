<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, db } from '@/firebase'
import { acceptInvite } from '@/lib/acceptInvite'
import { browserTimezone } from '@/lib/invites'
import { useAuthStore } from '@/stores/auth'
import SignInButtons from '@/components/auth/SignInButtons.vue'
import VerifyEmailNotice from '@/components/auth/VerifyEmailNotice.vue'
import CadenceMark from '@/components/brand/CadenceMark.vue'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const token = computed(() => String(route.params.token ?? ''))
const accepting = ref(false)
const needsVerification = ref(false)
const error = ref<string | null>(null)

async function accept() {
  const user = auth.currentUser
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

let proceeding = false
/** Decide what a signed-in visitor sees: already a member, needs to verify, or ready to accept. */
async function proceed() {
  if (proceeding) return
  proceeding = true
  try {
    await decide()
  } finally {
    proceeding = false
  }
}
async function decide() {
  await authStore.ready()
  if (authStore.hasProfile) {
    router.replace(authStore.isActive ? { name: 'today' } : { name: 'no-access' })
    return
  }
  const user = auth.currentUser
  if (!user) return
  // Returning from the verification link: pick up the new verified state.
  if (!user.emailVerified) {
    await user.reload()
    if (auth.currentUser?.emailVerified) await auth.currentUser.getIdToken(true)
  }
  if (auth.currentUser?.emailVerified) {
    needsVerification.value = false
    await accept()
  } else {
    needsVerification.value = true
  }
}

async function signOut() {
  await authStore.signOut()
  error.value = null
  needsVerification.value = false
}

onMounted(async () => {
  await authStore.ready()
  if (authStore.isSignedIn) await proceed()
})
// The sign-in form unmounts as soon as the user is signed in, so react to the state, not its event.
watch(
  () => authStore.isSignedIn,
  (signedIn) => {
    if (signedIn) proceed()
  },
)
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-5 py-12">
    <div class="flex flex-col items-start gap-4">
      <CadenceMark :size="48" class="text-primary" />
      <div>
        <h1 class="text-[2rem] leading-tight">You're invited to Cadence</h1>
        <p class="mt-2 text-muted-foreground">Use the email address this invite was sent to.</p>
      </div>
    </div>

    <SignInButtons v-if="!authStore.isSignedIn" :continue-path="route.fullPath" initial-mode="signup" />

    <template v-else-if="authStore.hasProfile">
      <p class="text-muted-foreground">You already have an account.</p>
      <Button size="lg" @click="router.replace({ name: 'today' })">Open Cadence</Button>
    </template>

    <VerifyEmailNotice v-else-if="needsVerification" :continue-path="route.fullPath" @verified="proceed" @sign-out="signOut" />

    <template v-else>
      <p v-if="accepting" class="text-muted-foreground">Setting up your account…</p>
      <Alert v-if="error" variant="destructive">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
      <div v-if="error" class="flex flex-col gap-2">
        <Button size="lg" :disabled="accepting" @click="accept">Try again</Button>
        <Button size="lg" variant="outline" :disabled="accepting" @click="signOut">Use a different account</Button>
      </div>
    </template>
  </main>
</template>
