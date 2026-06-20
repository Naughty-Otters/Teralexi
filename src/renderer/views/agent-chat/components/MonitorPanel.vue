<template>
  <div class="monitor-panel">
    <div class="chat-header">
      <div class="chat-header-left">
        <UIcon
          name="i-lucide-activity"
          style="width: 18px; height: 18px; color: var(--ui-text-muted)"
        />
        <div class="chat-header-info">
          <p class="chat-header-name">Token monitor</p>
          <p class="chat-header-meta">{{ summaryLabel }}</p>
        </div>
      </div>
      <div class="monitor-header-actions">
        <select v-model="rangeHours" class="monitor-range-select">
          <option :value="6">Last 6 hours</option>
          <option :value="24">Last 24 hours</option>
          <option :value="168">Last 7 days</option>
        </select>
        <button
          class="icon-btn"
          title="Refresh chart"
          :disabled="loading"
          @click="load"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            :class="{ 'monitor-spin': loading }"
          />
        </button>
        <button class="icon-btn" title="Close monitor" @click="emit('close')">
          ✕
        </button>
      </div>
    </div>

    <div class="monitor-body">
      <div v-if="loading && !hasChartData" class="monitor-empty">
        Loading token usage…
      </div>
      <div v-else-if="loadError" class="monitor-empty monitor-empty--error">
        {{ loadError }}
      </div>
      <div v-else-if="!hasChartData" class="monitor-empty">
        No token usage recorded yet. Run an agent to populate this chart.
      </div>
      <div v-else class="monitor-chart-wrap">
        <ul class="monitor-legend" aria-label="Models">
          <li
            v-for="series in chartSeries"
            :key="series.seriesKey"
            class="monitor-legend-item"
          >
            <span
              class="monitor-legend-swatch"
              :style="{ backgroundColor: series.color }"
              aria-hidden="true"
            />
            <span class="monitor-legend-label">{{ series.label }}</span>
            <span class="monitor-legend-total">
              {{ seriesTotal(series).toLocaleString() }}
            </span>
          </li>
        </ul>

        <div class="monitor-chart-plot">
          <svg
            class="monitor-chart"
            :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            :aria-label="chartAriaLabel"
          >
            <line
              :x1="padding.left"
              :y1="padding.top"
              :x2="padding.left"
              :y2="chartHeight - padding.bottom"
              class="monitor-axis"
            />
            <line
              :x1="padding.left"
              :y1="chartHeight - padding.bottom"
              :x2="chartWidth - padding.right"
              :y2="chartHeight - padding.bottom"
              class="monitor-axis"
            />
            <g
              v-for="series in chartSeries"
              :key="series.seriesKey"
              class="monitor-series"
            >
              <path
                v-if="series.linePath"
                :d="series.linePath"
                class="monitor-line"
                fill="none"
                :stroke="series.color"
              />
              <circle
                v-for="(dot, index) in series.dots"
                :key="`${series.seriesKey}-${index}`"
                :cx="dot.x"
                :cy="dot.y"
                r="3.5"
                class="monitor-dot"
                :fill="series.color"
              />
            </g>
          </svg>
          <div class="monitor-y-ticks">
            <span>{{ maxTokensLabel }}</span>
            <span>0</span>
          </div>
        </div>
        <div class="monitor-axis-labels">
          <span>{{ xStartLabel }}</span>
          <span>{{ xEndLabel }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'

type ChartPoint = {
  recordedAt: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

type ChartSeriesPayload = {
  seriesKey: string
  provider: string | null
  model: string | null
  label: string
  points: ChartPoint[]
}

type PlottedSeries = ChartSeriesPayload & {
  color: string
  linePath: string
  dots: Array<{ x: number; y: number }>
}

const SERIES_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
] as const

const emit = defineEmits<{ close: [] }>()

const loading = ref(false)
const loadError = ref('')
const seriesList = ref<ChartSeriesPayload[]>([])
const rangeHours = ref(24)

const chartWidth = 800
const chartHeight = 320
const padding = { top: 24, right: 24, bottom: 36, left: 48 }

const timeExtent = computed(() => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const series of seriesList.value) {
    for (const point of series.points) {
      const t = new Date(point.recordedAt).getTime()
      if (!Number.isFinite(t)) continue
      min = Math.min(min, t)
      max = Math.max(max, t)
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: Date.now(), max: Date.now() }
  }
  if (min === max) {
    return { min: min - 60_000, max: max + 60_000 }
  }
  return { min, max }
})

const maxTokens = computed(() => {
  let peak = 1
  for (const series of seriesList.value) {
    for (const point of series.points) {
      peak = Math.max(peak, Number(point.totalTokens) || 0)
    }
  }
  return peak
})

const maxTokensLabel = computed(() => maxTokens.value.toLocaleString())

const chartSeries = computed((): PlottedSeries[] =>
  seriesList.value.map((series, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length]!
    const dots = series.points.map((point) => ({
      x: plotXFromTime(point.recordedAt),
      y: plotY(Number(point.totalTokens) || 0),
    }))
    return {
      ...series,
      color,
      linePath: buildLinePath(dots),
      dots,
    }
  }),
)

const hasChartData = computed(() =>
  chartSeries.value.some((series) => series.points.length > 0),
)

const totalInRange = computed(() =>
  seriesList.value.reduce(
    (sum, series) => sum + seriesTotal(series),
    0,
  ),
)

const summaryLabel = computed(() => {
  if (loadError.value) return 'Could not load usage data'
  if (!hasChartData.value) return 'Token usage by model over time'
  const modelCount = chartSeries.value.length
  return `${totalInRange.value.toLocaleString()} tokens · ${modelCount} model${modelCount === 1 ? '' : 's'}`
})

const chartAriaLabel = computed(() =>
  chartSeries.value.map((s) => s.label).join(', '),
)

const xStartLabel = computed(() => formatAxisTime(new Date(timeExtent.value.min).toISOString()))
const xEndLabel = computed(() => formatAxisTime(new Date(timeExtent.value.max).toISOString()))

function seriesTotal(series: ChartSeriesPayload): number {
  return series.points.reduce(
    (sum, point) => sum + (Number(point.totalTokens) || 0),
    0,
  )
}

function bucketMinutesForRange(hours: number): number {
  if (hours <= 6) return 5
  if (hours <= 24) return 15
  return 60
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const channel = window.ipcRendererChannel?.ListTokenUsageChart
    if (!channel?.invoke) {
      loadError.value = 'Token monitor is unavailable in this build.'
      seriesList.value = []
      return
    }
    const since = new Date(
      Date.now() - rangeHours.value * 60 * 60 * 1000,
    ).toISOString()
    const result = await channel.invoke({
      userId: 'default',
      since,
      bucketMinutes: bucketMinutesForRange(rangeHours.value),
    })
    seriesList.value = Array.isArray(result) ? result : []
  } catch (err) {
    seriesList.value = []
    loadError.value =
      err instanceof Error ? err.message : 'Failed to load token usage.'
  } finally {
    loading.value = false
  }
}

function plotXFromTime(iso: string): number {
  const innerW = chartWidth - padding.left - padding.right
  const t = new Date(iso).getTime()
  const { min, max } = timeExtent.value
  const ratio = (t - min) / (max - min || 1)
  return padding.left + Math.min(1, Math.max(0, ratio)) * innerW
}

function plotY(tokens: number): number {
  const innerH = chartHeight - padding.top - padding.bottom
  const ratio = Math.min(1, Math.max(0, tokens / maxTokens.value))
  return chartHeight - padding.bottom - ratio * innerH
}

function buildLinePath(coords: Array<{ x: number; y: number }>): string {
  if (!coords.length) return ''

  if (coords.length === 1) {
    const { x, y } = coords[0]!
    const span = Math.min(40, (chartWidth - padding.left - padding.right) / 4)
    return `M ${x - span} ${y} L ${x + span} ${y}`
  }

  return coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
    .join(' ')
}

function formatAxisTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  void load()
})

onActivated(() => {
  void load()
})

watch(rangeHours, () => {
  void load()
})
</script>

<style scoped>
.monitor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--agent-header-min-height, 64px);
  padding: var(--agent-header-padding-y, 10px) var(--agent-header-padding-x, 20px);
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  flex-shrink: 0;
}
.chat-header-leading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.chat-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chat-header-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
  margin: 0;
}
.chat-header-meta {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 15px;
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}
.icon-btn--active {
  color: var(--color-primary-500);
}
.monitor-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.monitor-range-select {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
}
.monitor-body {
  flex: 1;
  min-height: 0;
  padding: 20px 24px 28px;
  overflow: auto;
}
.monitor-chart-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(500px, calc(100vh - 180px));
  min-height: 320px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg-elevated);
  padding: 16px;
  box-sizing: border-box;
}
.monitor-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  flex-shrink: 0;
}
.monitor-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-text);
  min-width: 0;
}
.monitor-legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
}
.monitor-legend-label {
  font-weight: 500;
  white-space: nowrap;
}
.monitor-legend-total {
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}
.monitor-chart-plot {
  position: relative;
  flex: 1;
  min-height: 220px;
}
.monitor-chart {
  width: 100%;
  height: 100%;
  display: block;
}
.monitor-axis {
  stroke: var(--ui-border);
  stroke-width: 1;
}
.monitor-line {
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}
.monitor-dot {
  stroke: var(--ui-bg-elevated);
  stroke-width: 1.5;
}
.monitor-y-ticks {
  position: absolute;
  left: 0;
  top: 24px;
  bottom: 36px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 10px;
  color: var(--ui-text-muted);
  pointer-events: none;
  width: 40px;
  text-align: right;
  padding-right: 6px;
  box-sizing: border-box;
}
.monitor-axis-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ui-text-muted);
  flex-shrink: 0;
}
.monitor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: var(--ui-text-muted);
  font-size: 14px;
  text-align: center;
  padding: 24px;
}
.monitor-empty--error {
  color: var(--color-error-500, #ef4444);
}
.monitor-spin {
  animation: monitor-spin 1s linear infinite;
}
@keyframes monitor-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
