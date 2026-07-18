<template>
  <div
    class="shiki-surface shiki-diff"
    :class="{
      'shiki-surface--compact': compact,
      'shiki-surface--fill': fill,
    }"
  >
    <div
      v-for="(line, index) in visibleLines"
      :key="index"
      class="shiki-diff__line"
      :class="`shiki-diff__line--${line.kind}`"
    >
      <span class="shiki-diff__gutter" aria-hidden="true">{{ line.gutter }}</span>
      <code class="shiki-diff__code" v-html="line.html" />
    </div>
    <p v-if="isTruncated" class="shiki-diff__more" aria-hidden="true">…</p>
    <code v-if="!lines.length && diff.trim()" class="shiki-diff__fallback">{{ diff }}</code>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue'
import { useAppIsDark } from '@renderer/composables/appColorMode'
import {
  highlightUnifiedDiff,
  type HighlightedDiffLine,
} from '@renderer/lib/shiki/highlight-unified-diff'
import {
  countBriefDiffLines,
  selectBriefDiffLines,
} from '@renderer/views/agent-chat/components/file-change/unifiedDiffLines'
import './shiki-shared.css'

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

const isDark = useAppIsDark()
const lines = ref<HighlightedDiffLine[]>([])

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
let requestId = 0

watch(
  [toRef(props, 'diff'), toRef(props, 'filePath'), isDark],
  async () => {
    const id = ++requestId
    const next = await highlightUnifiedDiff(props.diff, {
      filePath: props.filePath,
      isDark: isDark.value,
    })
    if (id === requestId) lines.value = next
  },
  { immediate: true },
)
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
  padding: 2px 12px 4px;
  font-size: var(--app-font-size-sm);
  line-height: 1;
  color: var(--ui-text-muted);
}
</style>
