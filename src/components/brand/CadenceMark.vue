<script setup lang="ts">
/**
 * The Cadence mark: a ring of seven segments (a week) around a check.
 * Draws in currentColor so it follows the theme.
 */
withDefaults(defineProps<{ size?: number | string; title?: string }>(), { size: 32, title: 'Cadence' })
// Seven equal segments with gaps on a circle of r=40 (circumference ≈ 251.3).
const C = 2 * Math.PI * 40
const seg = C / 7
const dash = `${(seg * 0.72).toFixed(2)} ${(seg * 0.28).toFixed(2)}`
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 100 100" role="img" :aria-label="title" fill="none">
    <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="11" :stroke-dasharray="dash" stroke-linecap="butt" transform="rotate(-90 50 50)" />
    <path d="M32 52 L45 65 L70 37" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
