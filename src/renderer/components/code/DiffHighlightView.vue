<template>
  <div
    class="shiki-surface shiki-diff"
    :class="{
      'shiki-surface--compact': compact,
      'shiki-surface--fill': fill,
    }"
    :style="diffSurfaceStyle"
  >
    <div
      v-for="(line, index) in visibleLines"
      :key="index"
      class="shiki-diff__line"
      :class="`shiki-diff__line--${line.kind}`"
    >
      <span
        class="shiki-diff__ln shiki-diff__ln--old"
        aria-hidden="true"
      >{{ formatLineNumber(line.oldLine) }}</span>
      <span
        class="shiki-diff__ln shiki-diff__ln--new"
        aria-hidden="true"
      >{{ formatLineNumber(line.newLine) }}</span>
      <span class="shiki-diff__gutter" aria-hidden="true">{{ line.gutter }}</span>
      <code class="shiki-diff__code" v-html="line.html" />
    </div>
    <p v-if="isTruncated" class="shiki-diff__more" aria-hidden="true">…</p>
    <code v-if="!lines.length && diff.trim()" class="shiki-diff__fallback">{{ diff }}</code>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  highlightUnifiedDiff,
  type HighlightedDiffLine,
} from '@renderer/lib/diff-highlight/highlight-unified-diff'
import {
  countBriefDiffLines,
  selectBriefDiffLines,
} from '@renderer/views/agent-chat/components/file-change/unifiedDiffLines'
import './shiki-shared.css'

/** Matches `.shiki-diff__line` min-height / line-height used in brief cards. */
const BRIEF_LINE_HEIGHT_EM = 1.4

const props = withDefaults(
  defineProps<{
    diff: string
    filePath?: string
    compact?: boolean
    /** Fill parent height (workspace diff panel); removes default max-height cap. */
    fill?: boolean
    /** Cap rendered diff lines (brief previews in tool panels). */
    maxLines?: number
  }>(),
  { compact: false, fill: false, maxLines: undefined },
)

const lines = computed<HighlightedDiffLine[]>(() => highlightUnifiedDiff(props.diff))

const visibleLines = computed(() => {
  const max = props.maxLines
  if (max == null || max <= 0) return lines.value
  return selectBriefDiffLines(lines.value, max)
})

const isTruncated = computed(() => {
  const max = props.maxLines
  if (max == null || max <= 0) return false
  return countBriefDiffLines(lines.value) > max
})

const lnDigits = computed(() => {
  let max = 0
  for (const line of visibleLines.value) {
    if (line.oldLine != null) max = Math.max(max, line.oldLine)
    if (line.newLine != null) max = Math.max(max, line.newLine)
  }
  return Math.max(2, String(max).length)
})

/** Reserve height for brief peeks so first paint matches final layout (CLS). */
const diffSurfaceStyle = computed(() => {
  const style: Record<string, string> = {
    '--diff-ln-ch': String(lnDigits.value),
  }
  const max = props.maxLines
  if (max != null && max > 0 && !props.fill) {
    const lineCount = Math.min(max, Math.max(visibleLines.value.length, 1))
    style.minHeight = `${lineCount * BRIEF_LINE_HEIGHT_EM}em`
  }
  return style
})

function formatLineNumber(n: number | null): string {
  return n == null ? '' : String(n)
}
</script>

<style scoped>
.shiki-diff {
  display: flex;
  flex-direction: column;
  gap: 0;
  white-space: normal;
}

.shiki-diff__fallback {
  display: block;
  font-family: var(--app-font-family);
  white-space: pre-wrap;
  word-break: break-word;
}

.shiki-diff__more {
  margin: 0;
  padding: 6px var(--diff-line-pad-x) 8px
    calc(
      var(--diff-accent-width) + (var(--diff-ln-ch, 2) * 1ch + 12px) * 2 +
        var(--diff-marker-width) + 10px
    );
  font-size: var(--app-font-size-sm);
  line-height: 1;
  color: var(--ui-text-muted);
  background: var(--diff-surface-bg);
}
</style>
