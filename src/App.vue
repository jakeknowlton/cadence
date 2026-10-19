<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import UpdateBanner from '@/components/layout/UpdateBanner.vue'
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <UpdateBanner />
</template>
