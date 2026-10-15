<script setup lang="ts">
import { computed, ref } from 'vue'
import { ICON_NAMES, iconFor } from '@/lib/icons'
import { Input } from '@/components/ui/input'

const model = defineModel<string | undefined>()
const search = ref('')
const names = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : ICON_NAMES
})
</script>

<template>
  <div class="grid gap-2">
    <Input v-model="search" placeholder="Search icons" />
    <div class="grid max-h-44 grid-cols-7 gap-1 overflow-y-auto rounded-xl bg-muted/60 p-2 sm:grid-cols-9">
      <button
        v-for="name in names"
        :key="name"
        type="button"
        class="flex aspect-square items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :class="model === name ? 'bg-primary text-primary-foreground hover:bg-primary' : ''"
        :title="name"
        :aria-pressed="model === name"
        @click="model = name"
      >
        <component :is="iconFor(name)" :size="22" :weight="model === name ? 'fill' : 'regular'" />
      </button>
    </div>
  </div>
</template>
