<script setup lang="ts">
import { computed } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip, type Plugin,
} from 'chart.js'
import type { SeriesPoint } from '@/lib/stats'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

const props = defineProps<{
  series: { label: string; points: SeriesPoint[] }[]
  kind: 'line' | 'bar'
  /** bucket keys where a task version changed; drawn as dashed vertical lines */
  markers?: string[]
  percent?: boolean
}>()

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
const PALETTE = computed(() => [1, 2, 3, 4, 5].map((i) => cssVar(`--chart-${i}`)).concat(['#7c3aed', '#0891b2', '#db2777']))
const gridColor = computed(() => (document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'))
const tickColor = computed(() => cssVar('--muted-foreground'))

const labels = computed(() => props.series[0]?.points.map((p) => p.label) ?? [])
const data = computed(() => ({
  labels: labels.value,
  datasets: props.series.map((s, i) => ({
    label: s.label,
    data: s.points.map((p) => (p.value === null ? null : props.percent ? Math.round(p.value * 100) : +p.value.toFixed(2))),
    borderColor: PALETTE.value[i % PALETTE.value.length],
    backgroundColor: props.kind === 'bar' ? PALETTE.value[i % PALETTE.value.length] : 'transparent',
    borderRadius: 4,
    tension: 0.3,
    spanGaps: true,
    pointRadius: 3,
  })),
}))

const markerPlugin = computed<Plugin>(() => ({
  id: 'versionMarkers',
  afterDraw(chart) {
    const keys = props.series[0]?.points.map((p) => p.key) ?? []
    const { ctx, chartArea, scales } = chart
    const x = scales.x
    if (!x || !props.markers?.length) return
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(120,120,120,0.7)'
    for (const m of props.markers) {
      const idx = keys.findIndex((k, i) => k <= m && (keys[i + 1] === undefined || keys[i + 1]! > m))
      if (idx < 0) continue
      const px = x.getPixelForValue(idx)
      ctx.beginPath()
      ctx.moveTo(px, chartArea.top)
      ctx.lineTo(px, chartArea.bottom)
      ctx.stroke()
    }
    ctx.restore()
  },
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: props.series.length > 1, position: 'bottom' as const, labels: { color: tickColor.value, boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
  scales: {
    y: { beginAtZero: true, grid: { color: gridColor.value }, ticks: { color: tickColor.value, precision: props.kind === 'bar' ? 0 : undefined, ...(props.percent ? { callback: (v: number | string) => `${v}%` } : {}) }, ...(props.percent ? { max: 100 } : {}) },
    x: { grid: { display: false }, ticks: { color: tickColor.value, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
  },
}))
</script>

<template>
  <div class="h-56 w-full">
    <Line v-if="kind === 'line'" :data="data" :options="options" :plugins="[markerPlugin]" />
    <Bar v-else :data="data" :options="options" :plugins="[markerPlugin]" />
  </div>
</template>
