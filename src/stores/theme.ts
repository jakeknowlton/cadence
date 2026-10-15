import { computed, ref, watchEffect } from 'vue'
import { defineStore } from 'pinia'

export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'cadence:theme'

export const useThemeStore = defineStore('theme', () => {
  const choice = ref<ThemeChoice>(read())
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  media.addEventListener('change', (e) => (systemDark.value = e.matches))

  const isDark = computed(() => (choice.value === 'system' ? systemDark.value : choice.value === 'dark'))

  watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value)
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', isDark.value ? '#0f1613' : '#f3f5f2')
  })

  function set(next: ThemeChoice) {
    choice.value = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* private mode */
    }
  }

  return { choice, isDark, set }
})

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}
