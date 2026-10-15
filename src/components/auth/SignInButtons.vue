<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import { PhGoogleLogo } from '@phosphor-icons/vue'
import { auth } from '@/firebase'
import { isValidEmail, normalizeEmail } from '@/lib/invites'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Mode = 'signin' | 'signup' | 'reset'

const props = withDefaults(
  defineProps<{
    /** Where the verification email's link returns to. */
    continuePath: string
    initialMode?: Mode
  }>(),
  { initialMode: 'signin' },
)
const emit = defineEmits<{ signedIn: [] }>()

const mode = ref<Mode>(props.initialMode)
const name = ref('')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const resetSent = ref(false)

const MIN_PASSWORD = 8
const submitLabel = computed(() =>
  mode.value === 'signup' ? 'Create account' : mode.value === 'reset' ? 'Send reset email' : 'Sign in',
)

function setMode(next: Mode) {
  mode.value = next
  error.value = null
  resetSent.value = false
}

async function withGoogle() {
  busy.value = true
  error.value = null
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
    emit('signedIn')
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}

async function submit() {
  const addr = normalizeEmail(email.value)
  if (!isValidEmail(addr)) {
    error.value = 'Enter a valid email address.'
    return
  }
  if (mode.value !== 'reset' && password.value.length < (mode.value === 'signup' ? MIN_PASSWORD : 1)) {
    error.value = mode.value === 'signup' ? `Use at least ${MIN_PASSWORD} characters for your password.` : 'Enter your password.'
    return
  }
  if (mode.value === 'signup' && !name.value.trim()) {
    error.value = 'Enter your name.'
    return
  }
  busy.value = true
  error.value = null
  try {
    if (mode.value === 'reset') {
      await sendPasswordResetEmail(auth, addr)
      resetSent.value = true
      return
    }
    if (mode.value === 'signup') {
      const { user } = await createUserWithEmailAndPassword(auth, addr, password.value)
      await updateProfile(user, { displayName: name.value.trim() })
      await sendEmailVerification(user, { url: `${location.origin}${props.continuePath}` })
    } else {
      await signInWithEmailAndPassword(auth, addr, password.value)
    }
    emit('signedIn')
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}

function messageFor(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match. Check them, or reset your password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.'
    case 'auth/weak-password':
      return `Use at least ${MIN_PASSWORD} characters for your password.`
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.'
    default:
      return (e as Error).message || 'Something went wrong. Try again.'
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Button size="lg" class="w-full" :disabled="busy" @click="withGoogle">
      <PhGoogleLogo :size="20" weight="bold" />
      Continue with Google
    </Button>

    <div class="flex items-center gap-3 text-sm text-muted-foreground">
      <span class="h-px flex-1 bg-border" />
      or use email
      <span class="h-px flex-1 bg-border" />
    </div>

    <Alert v-if="resetSent">
      <AlertDescription>
        If an account exists for that address, a reset link is on its way. Follow it, then come back and sign in.
      </AlertDescription>
    </Alert>

    <form v-else class="flex flex-col gap-3" novalidate @submit.prevent="submit">
      <div v-if="mode === 'signup'" class="grid gap-1.5">
        <Label for="name">Your name</Label>
        <Input id="name" v-model="name" autocomplete="name" maxlength="60" placeholder="How the group sees you" />
      </div>
      <div class="grid gap-1.5">
        <Label for="email">Email</Label>
        <Input id="email" v-model="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" />
      </div>
      <div v-if="mode !== 'reset'" class="grid gap-1.5">
        <div class="flex items-baseline justify-between">
          <Label for="password">Password</Label>
          <button v-if="mode === 'signin'" type="button" class="text-sm text-muted-foreground underline-offset-4 hover:underline" @click="setMode('reset')">
            Forgot password?
          </button>
        </div>
        <Input
          id="password"
          v-model="password"
          type="password"
          :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
          :placeholder="mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : ''"
        />
      </div>
      <Button type="submit" variant="secondary" size="lg" class="w-full" :disabled="busy">{{ submitLabel }}</Button>
    </form>

    <Alert v-if="error" variant="destructive">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <p class="text-center text-sm text-muted-foreground">
      <template v-if="mode === 'signin'">
        New here?
        <button type="button" class="font-semibold text-foreground underline-offset-4 hover:underline" @click="setMode('signup')">Create an account</button>
      </template>
      <template v-else>
        Already have an account?
        <button type="button" class="font-semibold text-foreground underline-offset-4 hover:underline" @click="setMode('signin')">Sign in</button>
      </template>
    </p>
  </div>
</template>
