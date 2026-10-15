<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import SignInButtons from '@/components/auth/SignInButtons.vue'
import CadenceMark from '@/components/brand/CadenceMark.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'

async function afterSignIn() {
  await authStore.ready()
  router.replace(authStore.isActive ? redirect : { name: 'no-access' })
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-10 px-5 py-12">
    <div class="flex flex-col items-start gap-4">
      <CadenceMark :size="64" class="text-primary" />
      <div>
        <h1 class="text-[2.4rem] leading-none">Cadence</h1>
        <p class="mt-2 max-w-[28ch] text-[1.05rem] text-muted-foreground">Keep the rhythm with your crew. Daily, weekly, monthly.</p>
      </div>
    </div>
    <SignInButtons :continue-path="`/login?redirect=${encodeURIComponent(redirect)}`" @signed-in="afterSignIn" />
    <p class="text-sm text-muted-foreground">Cadence is invite-only. If someone sent you an invite link, open it to join.</p>
  </main>
</template>
