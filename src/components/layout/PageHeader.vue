<script setup lang="ts">
import CadenceMark from '@/components/brand/CadenceMark.vue'
defineProps<{ title: string; subtitle?: string; brand?: boolean }>()
</script>

<template>
  <header class="flex items-start justify-between gap-4">
    <div class="flex min-w-0 items-center gap-3">
      <CadenceMark v-if="brand" :size="30" class="shrink-0 text-primary md:hidden" />
      <div class="min-w-0">
        <h1 class="truncate text-[1.75rem] leading-tight">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 text-sm text-muted-foreground">{{ subtitle }}</p>
      </div>
    </div>
    <div v-if="$slots.default" class="flex shrink-0 items-center gap-2">
      <slot />
    </div>
  </header>
</template>
