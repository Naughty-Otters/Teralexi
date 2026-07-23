<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { compactPaneScrollTop } from './reasoningBubbleLayout'
import {
  THINKING_STREAM_DISPLAY_INTERVAL_MS,
  thinkingBubbleDisplayText,
} from './thinkingBubbleDisplay'
import { useImperativePlainPre } from './useImperativePlainPre'

const props = defineProps<{
  part: unknown
}>()

const { t } = useI18n()

/** Vue-owned host only — the &lt;pre&gt; is created outside the VDOM. */
const bodyHostEl = ref<HTMLElement | null>(null)
/** Default collapsed; chevron expands (right → down). */
const userExpanded = ref(false)
/**
 * Ignore scroll events caused by our own scrollTop writes. Layout shifts from
 * the text reply otherwise clear stickToBottom and freeze the head preview.
 */
const programmaticScroll = ref(false)
const stickToBottom = ref(true)

let displayFlushTimer: ReturnType<typeof setTimeout> | null = null
let displayDirty = false

const rawText = computed(() => {
  const part = props.part as { type?: string; text?: string; state?: string }
  if (part?.type !== 'reasoning') return ''
  const raw = String(part.text ?? '')
  return part.state === 'streaming' || part.state === 'partial' ? raw : raw.trim()
})

const streaming = computed(() => {
  const state = (props.part as { state?: string })?.state
  return state === 'streaming' || state === 'partial'
})

const compact = computed(() => !userExpanded.value)

const visible = computed(() => Boolean(rawText.value || streaming.value))

const title = computed(() => t.value.chat.thoughtBubbleTitle)

function onBodyScroll() {
  if (!compact.value || programmaticScroll.value) return
  const el = plainPre.getPre()
  if (!el) return
  stickToBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight < 8
}

const plainPre = useImperativePlainPre({
  hostEl: bodyHostEl,
  className: 'reasoning-bubble__body',
  onScroll: onBodyScroll,
})

function computeDisplayText(): string {
  return thinkingBubbleDisplayText({
    raw: rawText.value,
    streaming: streaming.value,
    expanded: !compact.value,
  })
}

function syncCompactScrollNow() {
  const el = plainPre.getPre()
  if (!el || !compact.value || !stickToBottom.value) return
  programmaticScroll.value = true
  el.scrollTop = compactPaneScrollTop(el.scrollHeight, el.clientHeight)
  requestAnimationFrame(() => {
    programmaticScroll.value = false
  })
}

function paintBodyText(next: string) {
  plainPre.setText(next)
  if (compact.value) {
    stickToBottom.value = true
    syncCompactScrollNow()
  }
}

function flushDisplayText() {
  displayDirty = false
  if (displayFlushTimer != null) {
    clearTimeout(displayFlushTimer)
    displayFlushTimer = null
  }
  paintBodyText(computeDisplayText())
}

function scheduleDisplayText() {
  if (!streaming.value || !compact.value) {
    flushDisplayText()
    return
  }
  displayDirty = true
  if (displayFlushTimer != null) return
  displayFlushTimer = setTimeout(() => {
    displayFlushTimer = null
    if (!displayDirty) return
    flushDisplayText()
  }, THINKING_STREAM_DISPLAY_INTERVAL_MS)
}

async function scrollExpandedToTop() {
  await nextTick()
  const el = plainPre.getPre()
  if (!el) return
  programmaticScroll.value = true
  el.scrollTop = 0
  requestAnimationFrame(() => {
    programmaticScroll.value = false
  })
}

function toggleExpanded() {
  userExpanded.value = !userExpanded.value
  flushDisplayText()
  if (userExpanded.value) {
    stickToBottom.value = false
    void scrollExpandedToTop()
    return
  }
  stickToBottom.value = true
  syncCompactScrollNow()
}

onMounted(() => {
  flushDisplayText()
})

onBeforeUnmount(() => {
  if (displayFlushTimer != null) {
    clearTimeout(displayFlushTimer)
    displayFlushTimer = null
  }
})

watch(
  [rawText, streaming, compact, visible],
  async () => {
    if (!visible.value) return
    await nextTick()
    scheduleDisplayText()
  },
  { flush: 'post' },
)
</script>

<template>
  <article
    v-if="visible"
    class="reasoning-bubble"
    :class="{
      'reasoning-bubble--streaming': streaming,
      'reasoning-bubble--compact': compact,
      'reasoning-bubble--expanded': !compact,
    }"
  >
    <header class="reasoning-bubble__header">
      <button
        type="button"
        class="reasoning-bubble__title"
        :aria-expanded="!compact"
        :aria-label="compact ? 'Expand thinking' : 'Collapse thinking'"
        :title="compact ? 'Expand' : 'Collapse'"
        @click="toggleExpanded"
      >
        <UIcon
          name="i-lucide-brain"
          class="reasoning-bubble__icon"
          aria-hidden="true"
        />
        <span
          class="reasoning-bubble__title-text"
          :class="{ 'reasoning-bubble__title-text--shimmer': streaming }"
        >{{ title }}</span>
        <UIcon
          :name="compact ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
          class="reasoning-bubble__chevron"
          aria-hidden="true"
        />
      </button>
    </header>

    <!--
      Empty host only (v-once). The real <pre> is document.createElement'd and
      updated via textContent — it never appears in Vue's VNode tree.
    -->
    <div
      ref="bodyHostEl"
      v-once
      class="reasoning-bubble__body-host"
    />
  </article>
</template>

<style scoped>
.reasoning-bubble {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  align-self: stretch;
  margin: 8px 0;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  overflow: hidden;
  contain: content;
}

.reasoning-bubble--streaming {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 28%,
    var(--ui-border)
  );
}

.reasoning-bubble__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px 10px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  flex-shrink: 0;
}

.reasoning-bubble__title {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  flex: 0 1 auto;
}

.reasoning-bubble__title:hover {
  color: var(--ui-text);
}

.reasoning-bubble__title:focus-visible {
  outline: 2px solid var(--color-primary-500, #6366f1);
  outline-offset: 2px;
}

.reasoning-bubble__icon,
.reasoning-bubble__chevron {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  opacity: 0.75;
  color: currentColor;
}

.reasoning-bubble__title-text {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
}

@keyframes reasoning-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.reasoning-bubble__title-text--shimmer {
  background: linear-gradient(
    90deg,
    var(--ui-text-muted) 25%,
    color-mix(in srgb, var(--color-primary-400, #818cf8) 90%, transparent) 50%,
    var(--ui-text-muted) 75%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: reasoning-shimmer 1.6s linear infinite;
}

.reasoning-bubble__body-host {
  display: block;
  min-width: 0;
  width: 100%;
}

/*
 * Imperative <pre> is not scoped — style via host deep / global class name
 * set in createElement.
 */
.reasoning-bubble__body-host :deep(.reasoning-bubble__body),
.reasoning-bubble :deep(pre.reasoning-bubble__body) {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0 10px 10px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  font-family: var(--font-mono, ui-monospace, Menlo, monospace);
}

.reasoning-bubble--compact .reasoning-bubble__body-host :deep(.reasoning-bubble__body),
.reasoning-bubble--compact :deep(pre.reasoning-bubble__body) {
  height: 70px;
  max-height: 70px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.reasoning-bubble--compact :deep(pre.reasoning-bubble__body)::-webkit-scrollbar {
  display: none;
}

.reasoning-bubble--expanded .reasoning-bubble__body-host :deep(.reasoning-bubble__body),
.reasoning-bubble--expanded :deep(pre.reasoning-bubble__body) {
  height: auto;
  max-height: min(50vh, 360px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}
</style>
