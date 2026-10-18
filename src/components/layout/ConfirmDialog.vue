<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const props = defineProps<{
  title: string
  confirmLabel: string
  destructive?: boolean
  /** When set, the confirm button unlocks only once this exact text is typed. */
  confirmText?: string
  busy?: boolean
  error?: string | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()

const typed = ref('')
watch(open, (o) => {
  if (o) typed.value = ''
})
const ready = computed(() => !props.busy && (!props.confirmText || typed.value.trim() === props.confirmText.trim()))
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription as="div" class="grid gap-2 text-left"><slot /></DialogDescription>
      </DialogHeader>
      <form id="confirm-dialog" class="grid gap-1.5" @submit.prevent="ready && emit('confirm')">
        <template v-if="confirmText">
          <Label for="confirm-text">Type <span class="font-semibold">{{ confirmText }}</span> to confirm</Label>
          <Input id="confirm-text" v-model="typed" autocomplete="off" />
        </template>
      </form>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <DialogFooter class="gap-2">
        <Button type="button" variant="outline" :disabled="busy" @click="open = false">Cancel</Button>
        <Button type="submit" form="confirm-dialog" :variant="destructive ? 'destructive' : 'default'" :disabled="!ready">
          {{ busy ? 'Working…' : confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
