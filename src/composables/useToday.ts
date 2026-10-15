import { computed, onScopeDispose, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { browserTimezone } from '@/lib/invites'
import { localDate } from '@/lib/periods'

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0

/** The current date in the signed-in user's timezone, refreshed every minute so midnight rolls over. */
export function useToday() {
  const authStore = useAuthStore()
  subscribers += 1
  if (!timer) timer = setInterval(() => (now.value = new Date()), 60_000)
  onScopeDispose(() => {
    subscribers -= 1
    if (subscribers === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  const timezone = computed(() => authStore.profile?.timezone || browserTimezone())
  const today = computed(() => localDate(now.value, timezone.value))
  return { today, timezone, now }
}
