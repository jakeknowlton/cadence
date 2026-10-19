<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { PhArrowClockwise, PhX } from '@phosphor-icons/vue'
import { Button } from '@/components/ui/button'

const HOUR = 60 * 60 * 1000

// A new deploy downloads in the background and waits, so the open page keeps working from its own files.
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (!registration.installing && navigator.onLine) registration.update().catch(() => {})
    }
    setInterval(check, HOUR)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

const dismissed = ref(false)
const apply = () => updateServiceWorker(true)

// Switch automatically when an update turns up just after the app loads or is reopened from the
// background (the reopen check usually finishes a moment later). An update found mid-session waits
// for the banner instead.
const SETTLE_MS = 10_000
let openedAt = Date.now()
watch(needRefresh, (ready) => {
  if (ready && Date.now() - openedAt < SETTLE_MS) apply()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  openedAt = Date.now()
  if (needRefresh.value) apply()
})
</script>

<template>
  <div
    v-if="needRefresh && !dismissed"
    role="status"
    class="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-2 rounded-xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-lg md:bottom-4"
  >
    <span class="flex-1">Cadence has been updated.</span>
    <Button size="sm" variant="secondary" @click="apply"><PhArrowClockwise :size="16" /> Refresh</Button>
    <button type="button" class="rounded-md p-1.5 opacity-70 hover:opacity-100" aria-label="Later" @click="dismissed = true">
      <PhX :size="16" />
    </button>
  </div>
</template>
