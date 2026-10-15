import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { collection, query, where } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/firebase'
import type { Cadence, Weekday } from '@/types/task'
import type { TaskVersionDoc } from '@/types/group'
import type { Completion } from '@/types/completion'
import { isActiveDay, periodFor, type DateString } from '@/lib/periods'
import { versionsInEffect } from '@/lib/versions'

/** Completions and in-effect tasks for one cadence's period containing `date`. */
export function useGroupPeriod(
  groupId: MaybeRefOrGetter<string>,
  cadence: MaybeRefOrGetter<Cadence>,
  date: MaybeRefOrGetter<DateString>,
  weekStartsOn: MaybeRefOrGetter<Weekday>,
  versions: MaybeRefOrGetter<TaskVersionDoc[]>,
) {
  const period = computed(() => periodFor(toValue(date), toValue(cadence), toValue(weekStartsOn)))
  const completions = useCollection<Completion>(
    computed(() => query(collection(db, 'groups', toValue(groupId), 'completions'), where('periodKey', '==', period.value.key))),
  )
  const tasks = computed(() =>
    versionsInEffect(toValue(versions), period.value.start).filter(
      (v) => v.cadence === toValue(cadence) && (v.cadence !== 'daily' || isActiveDay(period.value.start, v.activeDays)),
    ),
  )
  return { period, completions, tasks }
}
