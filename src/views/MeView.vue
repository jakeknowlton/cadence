<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { PhCaretRight } from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, type ThemeChoice } from '@/stores/theme'
import { browserTimezone } from '@/lib/invites'
import PageHeader from '@/components/layout/PageHeader.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import NativeSelect from '@/components/ui/NativeSelect.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const authStore = useAuthStore()
const theme = useThemeStore()
const router = useRouter()

const displayName = ref('')
const timezone = ref('')
const saving = ref(false)
const saved = ref(false)

watchEffect(() => {
  if (authStore.profile) {
    displayName.value = authStore.profile.displayName
    timezone.value = authStore.profile.timezone
  }
})
const timezones = computed(() => {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  const list = intl.supportedValuesOf?.('timeZone') ?? []
  const current = timezone.value || browserTimezone()
  return (list.includes(current) ? list : [current, ...list]).map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))
})
const dirty = computed(
  () => !!authStore.profile && (displayName.value.trim() !== authStore.profile.displayName || timezone.value !== authStore.profile.timezone),
)
async function save() {
  saving.value = true
  saved.value = false
  try {
    await authStore.updateProfile({ displayName: displayName.value.trim(), timezone: timezone.value })
    saved.value = true
  } finally {
    saving.value = false
  }
}
async function signOut() {
  await authStore.signOut()
  router.replace({ name: 'login' })
}
const themeOptions: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
</script>

<template>
  <section class="mx-auto max-w-lg px-4 pt-6 pb-8">
    <PageHeader title="Me" />

    <template v-if="authStore.profile">
      <div class="mt-6 flex items-center gap-3">
        <img v-if="authStore.profile.photoURL" :src="authStore.profile.photoURL" alt="" class="size-14 rounded-full" referrerpolicy="no-referrer" />
        <div v-else class="flex size-14 items-center justify-center rounded-full bg-primary/15 text-xl font-extrabold text-primary">
          {{ authStore.profile.displayName.slice(0, 1).toUpperCase() }}
        </div>
        <div class="min-w-0">
          <div class="truncate font-semibold">{{ authStore.profile.displayName }}</div>
          <div class="truncate text-sm text-muted-foreground">{{ authStore.profile.email }}</div>
        </div>
        <Badge v-if="authStore.isAdmin" variant="secondary" class="ml-auto">Admin</Badge>
      </div>

      <form class="panel mt-6 grid gap-5 p-5" @submit.prevent="save">
        <div class="grid gap-1.5">
          <Label for="displayName">Display name</Label>
          <Input id="displayName" v-model="displayName" maxlength="60" autocomplete="nickname" />
        </div>
        <div class="grid gap-1.5">
          <Label for="timezone">Timezone</Label>
          <NativeSelect id="timezone" v-model="timezone" :options="timezones" />
          <p class="text-sm text-muted-foreground">Your days, weeks, and months roll over in this timezone.</p>
        </div>
        <div class="flex items-center gap-3">
          <Button type="submit" :disabled="!dirty || saving">Save changes</Button>
          <span v-if="saved && !dirty" class="text-sm text-muted-foreground">Saved</span>
        </div>
      </form>

      <div class="panel mt-4 flex items-center justify-between gap-4 p-5">
        <div>
          <div class="font-semibold">Appearance</div>
          <p class="text-sm text-muted-foreground">Auto follows your device.</p>
        </div>
        <SegmentedControl :model-value="theme.choice" :options="themeOptions" label="Theme" @update:model-value="theme.set($event)" />
      </div>

      <RouterLink :to="{ name: 'me-history' }" class="panel mt-4 flex items-center justify-between p-5 font-semibold hover:bg-accent/40">
        My history
        <PhCaretRight :size="18" class="text-muted-foreground" />
      </RouterLink>
    </template>

    <div class="mt-8">
      <Button variant="outline" @click="signOut">Sign out</Button>
    </div>
  </section>
</template>
