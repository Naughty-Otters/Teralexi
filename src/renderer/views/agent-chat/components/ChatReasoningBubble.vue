<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { limitThinkingBubbleWords } from '@shared/text/limit-thinking-bubble-words'
import { compactPaneScrollTop } from './reasoningBubbleLayout'

const props = defineProps<{
  part: unknown
}>()

const { t } = useI18n()

const bodyEl = ref<HTMLElement | null>(null)
/** Default collapsed; chevron expands to read from the top. */
const userExpanded = ref(false)
/**
 * Ignore scroll events caused by our own scrollTop writes. Layout shifts from
 * the text reply otherwise clear stickToBottom and freeze the head preview.
 */
const programmaticScroll = ref(false)
const stickToBottom = ref(true)

const text = computed(() => {
  const part = props.part as { type?: string; text?: string; state?: string }
  if (part?.type !== 'reasoning') return ''
  const raw = String(part.text ?? '')
  const body =
    part.state === 'streaming' || part.state === 'partial' ? raw : raw.trim()
  return limitThinkingBubbleWords(body)
})

const streaming = computed(() => {
  const state = (props.part as { state?: string })?.state
  return state === 'streaming' || state === 'partial'
})

const compact = computed(() => !userExpanded.value)

const title = computed(() => t.value.chat.thoughtBubbleTitle)

async function syncCompactScroll() {
  await nextTick()
  const el = bodyEl.value
  if (!el || !compact.value || !stickToBottom.value) return
  programmaticScroll.value = true
  el.scrollTop = compactPaneScrollTop(el.scrollHeight, el.clientHeight)
  requestAnimationFrame(() => {
    programmaticScroll.value = false
  })
}

async function scrollExpandedToTop() {
  await nextTick()
  const el = bodyEl.value
  if (!el) return
  programmaticScroll.value = true
  el.scrollTop = 0
  requestAnimationFrame(() => {
    programmaticScroll.value = false
  })
}

function toggleExpanded() {
  userExpanded.value = !userExpanded.value
  if (userExpanded.value) {
    stickToBottom.value = false
    void scrollExpandedToTop()
    return
  }
  stickToBottom.value = true
  void syncCompactScroll()
}

function onBodyScroll() {
  if (!compact.value || programmaticScroll.value) return
  const el = bodyEl.value
  if (!el) return
  stickToBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight < 8
}

onMounted(() => {
  void syncCompactScroll()
})

watch(
  [text, compact],
  () => {
    if (!compact.value) return
    // Any content change while compact: show the latest lines.
    stickToBottom.value = true
    void syncCompactScroll()
  },
  { flush: 'post' },
)
</script>

<template>
  <article
    v-if="text || streaming"
    class="reasoning-bubble"
    :class="{
      'reasoning-bubble--streaming': streaming,
      'reasoning-bubble--compact': compact,
      'reasoning-bubble--expanded': !compact,
    }"
  >
    <header class="reasoning-bubble__header">
      <UIcon
        name="i-lucide-brain"
        class="reasoning-bubble__icon"
        aria-hidden="true"
      />
      <div class="reasoning-bubble__label">
        <span
          class="reasoning-bubble__title"
          :class="{ 'reasoning-bubble__title--shimmer': streaming }"
        >{{ title }}</span>
        <button
          type="button"
          class="reasoning-bubble__toggle"
          :aria-expanded="!compact"
          :aria-label="compact ? 'Expand thinking' : 'Collapse thinking'"
          :title="compact ? 'Expand' : 'Collapse'"
          @click="toggleExpanded"
        >
          <UIcon
            :name="compact ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
            class="reasoning-bubble__toggle-icon"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>

    <pre
      ref="bodyEl"
      class="reasoning-bubble__body"
      @scroll.passive="onBodyScroll"
    >{{ text }}</pre>
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
  gap: 6px;
  padding: 8px 10px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  flex-shrink: 0;
}

.reasoning-bubble__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  opacity: 0.75;
  color: var(--ui-text-muted);
}

.reasoning-bubble__label {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 0 1 auto;
}

.reasoning-bubble__title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted);
}

@keyframes reasoning-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.reasoning-bubble__title--shimmer {
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

.reasoning-bubble__toggle {
  flex: 0 0 auto;
  margin: 0;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  line-height: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.reasoning-bubble__toggle:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}

.reasoning-bubble__toggle-icon {
  width: 14px;
  height: 14px;
}

.reasoning-bubble__body {
  box-sizing: border-box;
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

.reasoning-bubble--compact .reasoning-bubble__body {
  height: 70px;
  max-height: 70px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.reasoning-bubble--compact .reasoning-bubble__body::-webkit-scrollbar {
  display: none;
}

.reasoning-bubble--expanded .reasoning-bubble__body {
  height: auto;
  max-height: min(50vh, 360px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}
</style>
