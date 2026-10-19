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

// Switch automatically at natural moments: an update found while the app is loading (a refresh or a
// cold start would otherwise keep the old worker), or when the app is reopened from the background.
// An update found mid-session waits for the banner instead.
const loadedAt = Date.now()
watch(needRefresh, (ready) => {
  if (ready && Date.now() - loadedAt < 10_000) apply()
})
let wasHidden = false
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') wasHidden = true
  else if (wasHidden && needRefresh.value) apply()
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
