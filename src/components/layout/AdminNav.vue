<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
const route = useRoute()
const router = useRouter()
const current = computed({
  get: () => (String(route.name ?? '').startsWith('admin-group') || String(route.name ?? '').startsWith('admin-task') ? 'groups' : 'users'),
  set: (v: string) => router.push({ name: v === 'groups' ? 'admin-groups' : 'admin-users' }),
})
</script>

<template>
  <SegmentedControl v-model="current" :options="[{ value: 'users', label: 'People' }, { value: 'groups', label: 'Groups' }]" label="Admin" grow />
</template>
