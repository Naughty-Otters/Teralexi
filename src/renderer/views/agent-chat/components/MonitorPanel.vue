<template>
  <div class="monitor-panel">
    <div class="chat-header">
      <div class="chat-header-left">
        <UIcon
          name="i-lucide-activity"
          style="width: 18px; height: 18px; color: var(--ui-text-muted)"
        />
        <div class="chat-header-info">
          <p class="chat-header-name">Token usage</p>
          <p class="chat-header-meta">{{ summaryLabel }}</p>
        </div>
      </div>
      <div class="monitor-header-actions">
        <button
          class="icon-btn"
          title="Refresh usage"
          aria-label="Refresh usage"
          :disabled="loading"
          @click="load"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            :class="{ 'monitor-spin': loading }"
          />
        </button>
        <button
          class="icon-btn"
          title="Close monitor"
          aria-label="Close monitor"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="monitor-body">
      <SignInRequiredPanel
        v-if="!isSignedIn"
        :description="t.signInGate.monitor"
      />
      <template v-else>
      <div v-if="loading && !hasData" class="monitor-empty">
        Loading token usage…
      </div>
      <div v-else-if="loadError" class="monitor-empty monitor-empty--error">
        {{ loadError }}
      </div>
      <div v-else-if="!hasData" class="monitor-empty">
        No token usage recorded yet. Run an agent to populate this dashboard.
      </div>
      <div v-else class="monitor-dashboard">
        <section class="monitor-overview" aria-label="Usage overview">
          <h2 class="monitor-section-title">Overview</h2>
          <dl class="monitor-overview-grid">
            <div
              v-for="item in overviewItems"
              :key="item.key"
              class="monitor-overview-item"
            >
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="monitor-breakdown" aria-label="Daily usage breakdown">
          <div class="monitor-breakdown-header">
            <div class="monitor-breakdown-title-wrap">
              <h2 class="monitor-section-title">{{ breakdownTitle }}</h2>
              <div
                class="monitor-view-toggle"
                role="tablist"
                aria-label="Chart view"
              >
                <button
                  type="button"
                  role="tab"
                  class="monitor-view-toggle-btn"
                  :class="{ 'monitor-view-toggle-btn--active': breakdownView === 'daily' }"
                  :aria-selected="breakdownView === 'daily'"
                  @click="breakdownView = 'daily'"
                >
                  Bars
                </button>
                <button
                  type="button"
                  role="tab"
                  class="monitor-view-toggle-btn"
                  :class="{ 'monitor-view-toggle-btn--active': breakdownView === 'heatmap' }"
                  :aria-selected="breakdownView === 'heatmap'"
                  @click="breakdownView = 'heatmap'"
                >
                  Heatmap
                </button>
              </div>
            </div>
            <span class="monitor-breakdown-meta">
              {{ formatTokens(activeDashboard?.overview.totalTokens ?? 0) }} total
            </span>
          </div>

          <div class="monitor-legend-slot">
            <ul
              v-show="breakdownView === 'daily' && dailyDashboard?.models.length"
              class="monitor-legend"
              aria-label="Models"
            >
            <li
              v-for="model in dailyDashboard.models"
              :key="model.seriesKey"
              class="monitor-legend-item"
            >
              <span
                class="monitor-legend-swatch"
                :style="{ backgroundColor: colorForSeries(model.seriesKey) }"
                aria-hidden="true"
              />
              <span class="monitor-legend-label">{{ model.label }}</span>
              <span class="monitor-legend-total">
                {{ formatTokens(model.totalTokens) }}
              </span>
            </li>
            </ul>
          </div>

          <div class="monitor-chart-wrap">
            <div class="monitor-chart-viewport">
              <div
                v-if="breakdownView === 'daily'"
                class="monitor-chart-plot"
              >
              <svg
                class="monitor-chart"
                :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Daily total token usage for the last 30 days"
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
                  v-for="bar in plottedDailyBars"
                  :key="bar.date"
                  class="monitor-bar-group"
                >
                  <rect
                    :x="bar.x"
                    :y="bar.y"
                    :width="bar.width"
                    :height="bar.height"
                    :fill="DAILY_BAR_COLOR"
                    rx="1"
                    class="monitor-bar-segment"
                  >
                    <title>
                      {{ formatDayLabel(bar.date) }} ·
                      {{ formatTokens(bar.totalTokens) }}
                    </title>
                  </rect>
                </g>
              </svg>
              <div class="monitor-y-ticks">
                <span>{{ maxDailyLabel }}</span>
                <span>0</span>
              </div>
              </div>

              <div
                v-else
                class="monitor-heatmap-wrap"
                role="img"
                :aria-label="heatmapAriaLabel"
              >
                <div class="monitor-heatmap-scroll">
                  <div class="monitor-heatmap-grid" :style="heatmapGridStyle">
                    <div class="monitor-heatmap-corner" aria-hidden="true" />
                    <div
                      v-for="weekIndex in yearHeatmap.weekCount"
                      :key="`week-${weekIndex}`"
                      class="monitor-heatmap-week-head"
                      aria-hidden="true"
                    />

                    <template
                      v-for="row in yearHeatmap.rows"
                      :key="row.weekday"
                    >
                      <div
                        class="monitor-heatmap-row-label"
                        :class="{ 'monitor-heatmap-row-label--emphasis': row.showLabel }"
                      >
                        {{ row.showLabel ? row.label : '' }}
                      </div>
                      <div
                        v-for="(cell, cellIndex) in row.cells"
                        :key="`${row.weekday}-${cellIndex}`"
                        class="monitor-heatmap-cell"
                        :class="{
                          'monitor-heatmap-cell--padding': cell.padding,
                          'monitor-heatmap-cell--zero': cell.zero,
                          'monitor-heatmap-cell--filled': cell.filled,
                        }"
                        :style="cell.color ? { backgroundColor: cell.color } : undefined"
                        @mouseenter="onHeatmapCellEnter($event, cell)"
                        @mouseleave="onHeatmapCellLeave"
                      />
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <Teleport to="body">
              <div
                v-if="heatmapTip && breakdownView === 'heatmap'"
                class="monitor-heatmap-tip"
                :style="heatmapTipStyle"
              >
                {{ heatmapTip.text }}
              </div>
            </Teleport>

            <div class="monitor-chart-footer">
              <div
                v-if="breakdownView === 'daily'"
                class="monitor-axis-labels"
              >
                <span>{{ dailyRange.startLabel }}</span>
                <span>{{ dailyRange.endLabel }}</span>
              </div>
              <div v-else class="monitor-heatmap-footer">
                <span class="monitor-heatmap-range">
                  {{ yearHeatmap.rangeLabel }}
                </span>
                <span class="monitor-heatmap-scale-label">Less</span>
                <div class="monitor-heatmap-scale">
                  <span class="monitor-heatmap-scale-step monitor-heatmap-scale-step--zero" />
                  <span
                    v-for="step in heatmapScaleSteps"
                    :key="step"
                    class="monitor-heatmap-scale-step"
                    :style="{ opacity: step }"
                  />
                </div>
                <span class="monitor-heatmap-scale-label">More</span>
              </div>
            </div>
          </div>
        </section>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import SignInRequiredPanel from './SignInRequiredPanel.vue'
import {
  buildYearHeatmap,
  currentUtcYearRange,
  last30DaysRange,
  utcYear,
} from '@shared/token-usage-calendar'

type TokenUsageOverview = {
  sessions: number
  messages: number
  totalTokens: number
  activeDays: number
}

type TokenUsageModelSummary = {
  seriesKey: string
  provider: string | null
  model: string | null
  label: string
  totalTokens: number
}

type TokenUsageDailyBar = {
  date: string
  segments: Array<{ seriesKey: string; totalTokens: number }>
  totalTokens: number
}

type TokenUsageDashboard = {
  overview: TokenUsageOverview
  models: TokenUsageModelSummary[]
  dailyBars: TokenUsageDailyBar[]
}

type PlottedDailyBar = {
  date: string
  x: number
  y: number
  width: number
  height: number
  totalTokens: number
}

type BreakdownView = 'daily' | 'heatmap'

type HeatmapDisplayCell = {
  padding: boolean
  zero: boolean
  filled: boolean
  color?: string
  tooltip?: string
}

type HeatmapTip = {
  text: string
  x: number
  y: number
}

const DAILY_BAR_COLOR = '#c96442'
const HEATMAP_ACCENT = '#c96442'

const SERIES_COLORS = [
  '#c96442',
  '#6b8f71',
  '#5b7fd4',
  '#b08d57',
  '#8b6bb1',
  '#4f8f9b',
  '#c27c8a',
  '#7a8f6b',
  '#6f7fbf',
  '#a67c52',
] as const

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { isSignedIn } = useGoogleAccount()

const loading = ref(false)
const loadError = ref('')
const dailyDashboard = ref<TokenUsageDashboard | null>(null)
const heatmapDashboard = ref<TokenUsageDashboard | null>(null)
const breakdownView = ref<BreakdownView>('heatmap')
const heatmapTip = ref<HeatmapTip | null>(null)

const heatmapScaleSteps = [0.15, 0.35, 0.55, 0.75, 1] as const

const chartWidth = 560
const chartHeight = 140
const padding = { top: 12, right: 12, bottom: 20, left: 36 }

const activeDashboard = computed(() =>
  breakdownView.value === 'daily' ? dailyDashboard.value : heatmapDashboard.value,
)

const hasData = computed(
  () =>
    (dailyDashboard.value?.overview.totalTokens ?? 0) > 0 ||
    (heatmapDashboard.value?.overview.totalTokens ?? 0) > 0,
)

const breakdownTitle = computed(() =>
  breakdownView.value === 'daily' ? 'Last 30 days' : `${utcYear()} usage`,
)

const seriesColorMap = computed(() => {
  const map = new Map<string, string>()
  for (const [index, model] of (activeDashboard.value?.models ?? []).entries()) {
    map.set(model.seriesKey, SERIES_COLORS[index % SERIES_COLORS.length]!)
  }
  return map
})

const overviewItems = computed(() => {
  const overview = activeDashboard.value?.overview
  return [
    { key: 'sessions', label: 'Sessions', value: formatCount(overview?.sessions ?? 0) },
    { key: 'messages', label: 'Messages', value: formatCount(overview?.messages ?? 0) },
    {
      key: 'totalTokens',
      label: 'Total tokens',
      value: formatTokens(overview?.totalTokens ?? 0),
    },
    {
      key: 'activeDays',
      label: 'Active days',
      value: formatCount(overview?.activeDays ?? 0),
    },
  ]
})

const heatmapTokensByDate = computed(() => {
  const map = new Map<string, number>()
  for (const bar of heatmapDashboard.value?.dailyBars ?? []) {
    map.set(bar.date, bar.totalTokens)
  }
  return map
})

const dailyRange = computed(() => {
  const bars = dailyDashboard.value?.dailyBars ?? []
  return {
    startLabel: bars[0]?.date ? formatDayLabel(bars[0].date) : '',
    endLabel: bars[bars.length - 1]?.date
      ? formatDayLabel(bars[bars.length - 1]!.date)
      : '',
  }
})

const maxHeatmapValue = computed(() => {
  let peak = 1
  for (const bar of heatmapDashboard.value?.dailyBars ?? []) {
    peak = Math.max(peak, bar.totalTokens)
  }
  return peak
})

const yearHeatmap = computed(() => {
  const base = buildYearHeatmap({
    year: utcYear(),
    tokensByDate: heatmapTokensByDate.value,
  })

  const todayKey = new Date().toISOString().slice(0, 10)

  const rows = base.rows.map((row) => ({
    weekday: row.weekday,
    label: row.label,
    showLabel: row.showLabel,
    cells: row.cells.map((cell): HeatmapDisplayCell => {
      if (cell.kind === 'padding') {
        return { padding: true, zero: false, filled: false }
      }

      const totalTokens = cell.totalTokens
      const future = Boolean(cell.date && cell.date > todayKey)
      const tooltip = cell.date
        ? `${formatDayLabel(cell.date)} · ${formatTokens(totalTokens)} tokens`
        : undefined

      if (totalTokens > 0 && !future) {
        return {
          padding: false,
          zero: false,
          filled: true,
          color: heatColorWithBase(HEATMAP_ACCENT, totalTokens),
          tooltip,
        }
      }

      return {
        padding: false,
        zero: true,
        filled: false,
        tooltip,
      }
    }),
  }))

  return {
    weekCount: base.weekCount,
    rangeLabel: base.rangeLabel,
    rows,
  }
})

const heatmapGridStyle = computed(() => ({
  gridTemplateColumns: `22px repeat(${Math.max(yearHeatmap.value.weekCount, 1)}, 11px)`,
}))

const heatmapTipStyle = computed(() => {
  if (!heatmapTip.value) return undefined
  return {
    left: `${heatmapTip.value.x}px`,
    top: `${heatmapTip.value.y}px`,
  }
})

const maxDailyTotal = computed(() => {
  let peak = 1
  for (const bar of dailyDashboard.value?.dailyBars ?? []) {
    peak = Math.max(peak, bar.totalTokens)
  }
  return peak
})

const maxDailyLabel = computed(() => formatTokens(maxDailyTotal.value))

const plottedDailyBars = computed((): PlottedDailyBar[] => {
  const bars = dailyDashboard.value?.dailyBars ?? []
  if (!bars.length) return []

  const innerW = chartWidth - padding.left - padding.right
  const innerH = chartHeight - padding.top - padding.bottom
  const gap = 2
  const barWidth = Math.max(3, (innerW - gap * (bars.length - 1)) / bars.length)

  return bars.map((bar, index) => {
    const height =
      bar.totalTokens > 0 ? (bar.totalTokens / maxDailyTotal.value) * innerH : 0
    return {
      date: bar.date,
      x: padding.left + index * (barWidth + gap),
      y: chartHeight - padding.bottom - height,
      width: barWidth,
      height,
      totalTokens: bar.totalTokens,
    }
  })
})

const heatmapAriaLabel = computed(() =>
  yearHeatmap.value.rows
    .flatMap((row) =>
      row.cells
        .filter((cell) => !cell.padding && cell.tooltip)
        .map((cell) => cell.tooltip ?? ''),
    )
    .join('; '),
)

const summaryLabel = computed(() => {
  if (loadError.value) return 'Could not load usage data'
  if (!hasData.value) return 'Usage overview and daily breakdown'
  return breakdownView.value === 'daily'
    ? 'Last 30 days · ending today'
    : `${utcYear()} · daily totals`
})

function colorForSeries(seriesKey: string): string {
  return seriesColorMap.value.get(seriesKey) ?? SERIES_COLORS[0]!
}

function heatColorWithBase(baseColor: string, value: number): string {
  const ratio = Math.min(1, value / maxHeatmapValue.value)
  const alpha = 0.25 + ratio * 0.75
  return colorWithAlpha(baseColor, alpha)
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return hex
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

function formatCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

function formatTokens(value: number): string {
  const n = Math.max(0, Math.round(value))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

function formatDayLabel(date?: string): string {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function onHeatmapCellEnter(event: MouseEvent, cell: HeatmapDisplayCell) {
  if (cell.padding || !cell.tooltip) {
    heatmapTip.value = null
    return
  }
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  const cellRect = target.getBoundingClientRect()
  heatmapTip.value = {
    text: cell.tooltip,
    x: cellRect.left + cellRect.width / 2,
    y: cellRect.top - 6,
  }
}

function onHeatmapCellLeave() {
  heatmapTip.value = null
}

async function loadDashboard(args: {
  since: string
  until?: string
}): Promise<TokenUsageDashboard | null> {
  const channel = window.ipcRendererChannel?.ListTokenUsageChart
  if (!channel?.invoke) {
    throw new Error('Token monitor is unavailable in this build.')
  }
  return channel.invoke({
    userId: 'default',
    since: args.since,
    until: args.until,
  })
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [dailyResult, heatmapResult] = await Promise.all([
      loadDashboard(last30DaysRange()),
      loadDashboard(currentUtcYearRange()),
    ])
    dailyDashboard.value = dailyResult
    heatmapDashboard.value = heatmapResult
  } catch (err) {
    dailyDashboard.value = null
    heatmapDashboard.value = null
    loadError.value =
      err instanceof Error ? err.message : 'Failed to load token usage.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

onActivated(() => {
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
.monitor-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.monitor-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px 20px;
  overflow: auto;
}
.monitor-dashboard {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 800px;
}
.monitor-legend-slot {
  min-height: 22px;
}
.monitor-section-title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text);
  letter-spacing: 0.01em;
}
.monitor-overview {
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated);
  padding: 12px 14px;
}
.monitor-overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;
}
.monitor-overview-item dt {
  margin: 0 0 2px;
  font-size: 10px;
  font-weight: 500;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.monitor-overview-item dd {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.monitor-breakdown {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.monitor-breakdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.monitor-breakdown-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}
.monitor-breakdown-header .monitor-section-title {
  margin: 0;
}
.monitor-view-toggle {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  background: var(--ui-bg);
}
.monitor-view-toggle-btn {
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
}
.monitor-view-toggle-btn--active {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.monitor-breakdown-meta {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}
.monitor-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.monitor-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ui-text);
}
.monitor-legend-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.monitor-legend-label {
  font-weight: 500;
}
.monitor-legend-total {
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}
.monitor-chart-wrap {
  --monitor-heatmap-zero-bg: color-mix(in srgb, var(--ui-text-muted) 16%, var(--ui-bg-accented));
  --monitor-heatmap-zero-border: color-mix(in srgb, var(--ui-text-muted) 32%, var(--ui-border));
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated);
  padding: 12px;
  box-sizing: border-box;
}
.monitor-chart-viewport {
  height: 140px;
  flex-shrink: 0;
  overflow: hidden;
}
.monitor-chart-footer {
  min-height: 18px;
  flex-shrink: 0;
}
.monitor-chart-plot {
  position: relative;
  height: 100%;
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
.monitor-bar-segment {
  transition: opacity 0.15s ease;
}
.monitor-bar-group:hover .monitor-bar-segment {
  opacity: 0.85;
}
.monitor-y-ticks {
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 9px;
  color: var(--ui-text-muted);
  pointer-events: none;
  width: 32px;
  text-align: right;
  padding-right: 4px;
}
.monitor-axis-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--ui-text-muted);
}
.monitor-heatmap-wrap {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-start;
}
.monitor-heatmap-scroll {
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
.monitor-heatmap-grid {
  --heatmap-cell: 11px;
  --heatmap-gap: 3px;
  display: grid;
  gap: var(--heatmap-gap);
  width: fit-content;
}
.monitor-heatmap-corner {
  height: 0;
}
.monitor-heatmap-week-head {
  height: 0;
}
.monitor-heatmap-row-label {
  display: flex;
  align-items: center;
  height: var(--heatmap-cell);
  font-size: 9px;
  font-weight: 500;
  color: var(--ui-text-muted);
  line-height: 1;
}
.monitor-heatmap-row-label--emphasis {
  color: var(--ui-text);
  font-weight: 600;
}
.monitor-heatmap-cell {
  width: var(--heatmap-cell);
  height: var(--heatmap-cell);
  border-radius: 2px;
  box-sizing: border-box;
}
.monitor-heatmap-cell--padding {
  background: transparent;
  pointer-events: none;
}
.monitor-heatmap-cell--zero {
  background: var(--monitor-heatmap-zero-bg);
  border: 1px solid var(--monitor-heatmap-zero-border);
}
.monitor-heatmap-cell--filled {
  border: 1px solid color-mix(in srgb, var(--monitor-heatmap-zero-border) 50%, transparent);
}
.monitor-heatmap-cell--filled:hover,
.monitor-heatmap-cell--zero:hover {
  outline: 1px solid color-mix(in srgb, var(--ui-text-muted) 45%, transparent);
  outline-offset: 1px;
  z-index: 1;
}
.monitor-heatmap-tip {
  position: fixed;
  transform: translate(-50%, -100%);
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--ui-bg-inverted, #171717);
  color: var(--ui-text-inverted, #fafafa);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.monitor-heatmap-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
}
.monitor-heatmap-range {
  font-size: 10px;
  color: var(--ui-text-muted);
  margin-right: 4px;
}
.monitor-heatmap-scale-label {
  font-size: 9px;
  color: var(--ui-text-muted);
}
.monitor-heatmap-scale {
  display: inline-flex;
  gap: 2px;
}
.monitor-heatmap-scale-step {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: #c96442;
}
.monitor-heatmap-scale-step--zero {
  background: var(--monitor-heatmap-zero-bg);
  border: 1px solid var(--monitor-heatmap-zero-border);
}
.monitor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  color: var(--ui-text-muted);
  font-size: 13px;
  text-align: center;
  padding: 20px;
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
@media (max-width: 720px) {
  .monitor-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
