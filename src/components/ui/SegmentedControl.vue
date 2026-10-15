<script setup lang="ts" generic="T extends string | number">
defineProps<{ options: { value: T; label: string }[]; label?: string; grow?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="inline-flex rounded-lg bg-muted p-0.5 text-sm" :class="grow ? 'grid w-full' : ''" :style="grow ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined" role="tablist" :aria-label="label">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="tab"
      class="h-8 rounded-[7px] px-3 font-medium transition-colors"
      :class="model === o.value ? 'bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted-foreground hover:text-foreground'"
      :aria-selected="model === o.value"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
