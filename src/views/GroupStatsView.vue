<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { collection, query, where } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/firebase'
import { useGroup, useProfiles } from '@/composables/useGroup'
import type { Completion } from '@/types/completion'
import { localDate, shiftDays } from '@/lib/periods'
import { computeStats, rateSeries, valueSeries, type Bucket } from '@/lib/stats'
import { AGG_LABELS, chartFormat, chartSeries, chartSummary, formatChartValue } from '@/lib/charts'
import GroupHeader from '@/components/groups/GroupHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import TrendChart from '@/components/groups/TrendChart.vue'
import SelectField from '@/components/ui/SelectField.vue'
import { Label } from '@/components/ui/label'

const route = useRoute()
const groupId = computed(() => String(route.params.id))
const { group, members, latest, versions, today, activeMembers, hidden } = useGroup(groupId)
const { nameOf } = useProfiles(() => members.value.map((m) => m.userId))

const taskId = ref('')
watchEffect(() => {
  if (!taskId.value && latest.value[0]) taskId.value = latest.value[0].taskId
})
const memberId = ref('all')
const rangeDays = ref(90)
const RANGES = [{ value: 30, label: 'Last 30 days' }, { value: 90, label: 'Last 90 days' }, { value: 365, label: 'Last year' }]

const from = computed(() => shiftDays(today.value, -rangeDays.value + 1))
const bucket = computed<Bucket>(() => (rangeDays.value > 120 ? 'month' : 'week'))
const lineage = computed(() => versions.value.filter((v) => v.taskId === taskId.value))
const task = computed(() => latest.value.find((v) => v.taskId === taskId.value) ?? null)

const raw = useCollection<Completion>(
  computed(() => (taskId.value ? query(collection(db, 'groups', groupId.value, 'completions'), where('taskId', '==', taskId.value)) : null)),
)
const completions = computed(() => raw.value.filter((c) => !c.deletedAt))

const subjects = computed(() => (memberId.value === 'all' ? activeMembers.value : members.value.filter((m) => m.id === memberId.value)))
const tz = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone)

const perMember = computed(() =>
  subjects.value.map((m) => {
    const mine = completions.value.filter((c) => c.userId === m.userId)
    const stats = lineage.value.length
      ? computeStats({
          versions: lineage.value,
          completions: mine,
          joinedOn: m.joinedAt ? localDate(m.joinedAt.toDate(), tz.value) : '2000-01-01',
          leftOn: m.leftAt ? localDate(m.leftAt.toDate(), tz.value) : null,
          from: from.value,
          to: today.value,
          today: today.value,
          weekStartsOn: group.value?.weekStartsOn ?? 1,
        })
      : { segments: [], fields: [] }
    return { member: m, name: nameOf(m.userId), completions: mine, stats }
  }),
)

const seriesOpts = computed(() => ({ from: from.value, to: today.value, bucket: bucket.value, weekStartsOn: group.value?.weekStartsOn ?? 1 }))
/** The admin's charts for this task, each with its formatting and per-member data. None set means none shown. */
const charts = computed(() => {
  if (!task.value) return []
  const fields = task.value.fields
  return (task.value.charts ?? []).map((chart) => {
    const format = chartFormat(chart, fields)
    return {
      chart,
      format,
      series: perMember.value.map((p) => ({ label: p.name, points: chartSeries(chart, p.completions, { ...seriesOpts.value, scale: format.scale }) })),
      summaries: perMember.value.map((p) => chartSummary(chart, p.completions, from.value, today.value, format.scale)),
    }
  })
})
// Always weekly: monthly counts would vary with the length of the month.
const countChart = computed(() => perMember.value.map((p) => ({ label: p.name, points: valueSeries(p.completions, { ...seriesOpts.value, bucket: 'week', agg: 'count' }) })))
const rateChart = computed(() => perMember.value.map((p) => ({ label: p.name, points: rateSeries(p.stats.segments, from.value, today.value) })))
const markers = computed(() => lineage.value.filter((v) => v.version > 1).map((v) => v.effectiveFrom))

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 pt-6 pb-8">
    <EmptyState v-if="hidden" title="This group isn’t available" body="An admin has archived it." />
    <GroupHeader v-else-if="group" :group="group" current="stats" />
    <template v-if="group && !hidden">
      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="grid gap-1.5">
          <Label for="s-task">Task</Label>
          <SelectField id="s-task" v-model="taskId" :options="latest.map((v) => ({ value: v.taskId, label: v.name }))" />
        </div>
        <div class="grid gap-1.5">
          <Label for="s-member">Who</Label>
          <SelectField id="s-member" v-model="memberId" :options="[{ value: 'all', label: 'Everyone' }, ...members.map((m) => ({ value: m.id, label: nameOf(m.userId) }))]" />
        </div>
        <div class="grid gap-1.5">
          <Label for="s-range">Range</Label>
          <SelectField id="s-range" v-model="rangeDays" :options="RANGES" />
        </div>
      </div>

      <template v-if="task">
        <div class="mt-6 grid gap-3">
          <div v-for="(p, pi) in perMember" :key="p.member.id" class="panel p-4">
            <div class="flex items-baseline justify-between gap-3">
              <h2 class="truncate text-base">{{ p.name }}</h2>
              <span v-if="p.stats.segments.length === 0" class="text-sm text-muted-foreground">No periods in range</span>
            </div>
            <div v-for="s in p.stats.segments" :key="s.from" class="mt-3 grid grid-cols-3 gap-2">
              <div class="rounded-lg bg-muted/70 px-3 py-2">
                <div class="tabular text-xl font-extrabold">{{ pct(s.completionRate) }}</div>
                <div class="text-xs text-muted-foreground">{{ s.cadence }} rate</div>
              </div>
              <div class="rounded-lg bg-muted/70 px-3 py-2">
                <div class="tabular text-xl font-extrabold">{{ s.currentStreak }}</div>
                <div class="text-xs text-muted-foreground">streak</div>
              </div>
              <div class="rounded-lg bg-muted/70 px-3 py-2">
                <div class="tabular text-xl font-extrabold">{{ s.longestStreak }}</div>
                <div class="text-xs text-muted-foreground">best</div>
              </div>
            </div>
            <dl v-if="charts.some((c) => c.summaries[pi]!.entries > 0)" class="mt-3 grid gap-1 text-sm">
              <template v-for="(c, ci) in charts" :key="ci">
                <div v-if="c.summaries[pi]!.entries > 0" class="flex flex-wrap gap-x-1.5">
                  <dt class="text-muted-foreground">{{ c.chart.name }}</dt>
                  <dd class="tabular font-medium">
                    {{ formatChartValue(c.summaries[pi]!.value, c.format) }}
                    <span class="font-normal text-muted-foreground">{{ AGG_LABELS[c.chart.agg].toLowerCase() }}, {{ c.summaries[pi]!.entries }} {{ c.summaries[pi]!.entries === 1 ? 'entry' : 'entries' }}</span>
                  </dd>
                </div>
              </template>
            </dl>
          </div>
        </div>

        <div class="mt-8 grid gap-6">
          <div v-for="(c, ci) in charts" :key="ci" class="panel p-4">
            <h2 class="text-base">{{ c.chart.name }} per {{ bucket }}</h2>
            <p class="text-sm text-muted-foreground">{{ AGG_LABELS[c.chart.agg] }}</p>
            <TrendChart class="mt-3" :series="c.series" kind="line" :markers="markers" :format="(v) => formatChartValue(v, c.format)" />
          </div>
          <div class="panel p-4">
            <h2 class="text-base">Completions per week</h2>
            <TrendChart class="mt-3" :series="countChart" kind="bar" :markers="markers" />
          </div>
          <div class="panel p-4">
            <h2 class="text-base">Completion rate per month</h2>
            <TrendChart class="mt-3" :series="rateChart" kind="line" :markers="markers" percent />
          </div>
          <p v-if="markers.length" class="text-sm text-muted-foreground">Dashed lines mark where the task definition changed.</p>
        </div>
      </template>
      <p v-else class="mt-6 text-sm text-muted-foreground">No tasks yet.</p>
    </template>
  </section>
</template>
