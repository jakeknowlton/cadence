<script setup lang="ts">
import { onScopeDispose, ref } from 'vue'
import { sendEmailVerification } from 'firebase/auth'
import { PhEnvelopeSimple } from '@phosphor-icons/vue'
import { auth } from '@/firebase'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const props = defineProps<{ continuePath: string }>()
const emit = defineEmits<{ verified: []; signOut: [] }>()

const checking = ref(false)
const message = ref<string | null>(null)
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onScopeDispose(() => timer && clearInterval(timer))

/** Reload the user and refresh the ID token so security rules see email_verified. */
async function check() {
  const user = auth.currentUser
  if (!user) return
  checking.value = true
  message.value = null
  try {
    await user.reload()
    if (auth.currentUser?.emailVerified) {
      await auth.currentUser.getIdToken(true)
      emit('verified')
    } else {
      message.value = 'Not verified yet. Open the link in the email, then try again.'
    }
  } finally {
    checking.value = false
  }
}

async function resend() {
  const user = auth.currentUser
  if (!user || cooldown.value > 0) return
  try {
    await sendEmailVerification(user, { url: `${location.origin}${props.continuePath}` })
    message.value = 'Sent another verification email.'
    cooldown.value = 60
    timer = setInterval(() => {
      cooldown.value -= 1
      if (cooldown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  } catch (e) {
    const code = (e as { code?: string }).code
    message.value = code === 'auth/too-many-requests' ? 'Too many emails sent. Wait a few minutes and try again.' : (e as Error).message
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="panel flex gap-3 p-4">
      <PhEnvelopeSimple :size="24" class="mt-0.5 shrink-0 text-primary" />
      <div>
        <p class="font-semibold">Check your email</p>
        <p class="mt-1 text-sm text-muted-foreground">
          We sent a verification link to <span class="font-medium text-foreground">{{ auth.currentUser?.email }}</span>.
          Open it, then come back here. Check spam if it doesn’t arrive in a minute.
        </p>
      </div>
    </div>
    <Button size="lg" :disabled="checking" @click="check">I’ve verified my email</Button>
    <Button size="lg" variant="outline" :disabled="cooldown > 0" @click="resend">
      {{ cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email' }}
    </Button>
    <Alert v-if="message">
      <AlertDescription>{{ message }}</AlertDescription>
    </Alert>
    <button type="button" class="text-sm text-muted-foreground underline-offset-4 hover:underline" @click="emit('signOut')">
      Use a different account
    </button>
  </div>
</template>
