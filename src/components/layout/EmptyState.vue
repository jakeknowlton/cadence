<script setup lang="ts">
import type { Component } from 'vue'
defineProps<{ icon?: Component; title: string; body?: string }>()
</script>

<template>
  <div class="panel flex flex-col items-start gap-2 px-5 py-6">
    <component :is="icon" v-if="icon" :size="28" class="text-muted-foreground" />
    <p class="font-semibold">{{ title }}</p>
    <p v-if="body" class="max-w-prose text-sm text-muted-foreground">{{ body }}</p>
    <div v-if="$slots.default" class="mt-1"><slot /></div>
  </div>
</template>
