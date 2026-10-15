<script setup lang="ts">
import { ref } from 'vue'
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
} from 'firebase/auth'
import { PhEnvelopeSimple, PhGoogleLogo } from '@phosphor-icons/vue'
import { auth } from '@/firebase'
import { isValidEmail, normalizeEmail } from '@/lib/invites'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const props = defineProps<{
  /** Where to land after sign-in; used as the email-link continue URL. */
  continuePath: string
}>()
const emit = defineEmits<{ signedIn: [] }>()

const EMAIL_KEY = 'cadence:emailForSignIn'

const email = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const linkSent = ref(false)

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

async function sendLink() {
  const addr = normalizeEmail(email.value)
  if (!isValidEmail(addr)) {
    error.value = 'Enter a valid email address.'
    return
  }
  busy.value = true
  error.value = null
  try {
    await sendSignInLinkToEmail(auth, addr, {
      url: `${location.origin}${props.continuePath}`,
      handleCodeInApp: true,
    })
    localStorage.setItem(EMAIL_KEY, addr)
    linkSent.value = true
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    busy.value = false
  }
}

/** Complete an email-link sign-in if the current URL is one. Returns true if a sign-in happened. */
async function completeEmailLink(): Promise<boolean> {
  if (!isSignInWithEmailLink(auth, location.href)) return false
  let addr = localStorage.getItem(EMAIL_KEY)
  if (!addr) addr = window.prompt('Confirm the email address this link was sent to') ?? ''
  if (!addr) return false
  busy.value = true
  try {
    await signInWithEmailLink(auth, normalizeEmail(addr), location.href)
    localStorage.removeItem(EMAIL_KEY)
    history.replaceState(null, '', location.pathname)
    emit('signedIn')
    return true
  } catch (e) {
    error.value = messageFor(e)
    return false
  } finally {
    busy.value = false
  }
}

function messageFor(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  if (code === 'auth/popup-closed-by-user') return 'Sign-in was cancelled.'
  if (code === 'auth/invalid-action-code') return 'This sign-in link is invalid or has expired.'
  return (e as Error).message || 'Something went wrong.'
}

defineExpose({ completeEmailLink })
</script>

<template>
  <div class="flex flex-col gap-4">
    <Button size="lg" class="w-full" :disabled="busy" @click="withGoogle">
      <PhGoogleLogo :size="20" weight="bold" />
      Continue with Google
    </Button>

    <div class="flex items-center gap-3 text-sm text-muted-foreground">
      <span class="h-px flex-1 bg-border" />
      or
      <span class="h-px flex-1 bg-border" />
    </div>

    <form v-if="!linkSent" class="flex flex-col gap-3" @submit.prevent="sendLink">
      <div class="grid gap-1.5">
        <Label for="email">Email</Label>
        <Input id="email" v-model="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" />
      </div>
      <Button type="submit" variant="secondary" size="lg" class="w-full" :disabled="busy">
        <PhEnvelopeSimple :size="20" />
        Email me a sign-in link
      </Button>
    </form>
    <Alert v-else>
      <AlertDescription>
        Check your email for a sign-in link. It works on this device or any other.
      </AlertDescription>
    </Alert>

    <Alert v-if="error" variant="destructive">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>
  </div>
</template>
