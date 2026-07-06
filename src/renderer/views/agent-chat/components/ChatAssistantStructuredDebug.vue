<template>
  <div v-if="view" class="structured-debug-view assistant-content-v2">
    <VTimeline
      v-if="timelineItems.length > 0"
      :model-value="expandedId"
      class="structured-debug-timeline"
      :items="timelineItems"
      @update:model-value="onExpandedIdChange"
    >
      <template #item-detail="{ item }">
        <template v-if="sectionForItem(item)">
          <div
            v-if="sectionForItem(item)!.bodyHtml"
            class="structured-debug-section-body msg-html"
            v-html="sectionForItem(item)!.bodyHtml"
          />
          <div
            v-else-if="sectionForItem(item)!.status === 'running'"
            class="structured-debug-section-body structured-debug-section-body--empty"
            aria-live="polite"
          >
            <span class="structured-debug-section-body__placeholder">typing…</span>
          </div>
        </template>
      </template>
    </VTimeline>
  </div>
  <div
    v-else
    class="msg-html structured-debug-fallback"
    v-html="fallbackHtml"
  />
</template>

<script setup lang="ts">
import type { UIMessage } from '@teralexi-ai'
import { computed, ref, watch } from 'vue'
import { VTimeline } from '@renderer/components/timeline'
import type { VTimelineItem } from '@renderer/components/timeline'
import { useAssistantStructuredMessageView } from '../useAssistantStructuredMessageView'
import type { StructuredDebugSection } from '../structuredDebugViewModel'
import {
  assistantBubbleActivityLabel,
  assistantBubbleSpeakerName,
} from '@shared/agent/chat-persona'

const props = defineProps<{
  message: UIMessage
}>()

const { view, sections, fallbackHtml } = useAssistantStructuredMessageView(
  () => props.message,
)

const sectionsById = computed(() => {
  const map = new Map<string, StructuredDebugSection>()
  for (const section of sections.value) {
    map.set(section.id, section)
  }
  return map
})

const timelineItems = computed<VTimelineItem[]>(() =>
  sections.value.map((section) => {
    const activity = assistantBubbleActivityLabel(
      section.id,
      section.status === 'running' ? 'running' : 'done',
      section.sectionKind === 'attachments' ? { attachments: true } : undefined,
    )
    return {
      id: section.id,
      label: `${assistantBubbleSpeakerName()} — ${activity}`,
      fill: section.status === 'done' ? 'filled' : 'outlined',
    }
  }),
)

const expandedId = ref<string | number | undefined>(undefined)
let prevSectionCount = 0

function latestSectionId(
  sectionList: readonly StructuredDebugSection[],
): string | undefined {
  if (sectionList.length === 0) return undefined
  return sectionList[sectionList.length - 1]!.id
}

function sectionForItem(item: VTimelineItem): StructuredDebugSection | undefined {
  const id = item.id != null ? String(item.id) : ''
  if (!id) return undefined
  return sectionsById.value.get(id)
}

watch(
  () => sections.value.length,
  (count) => {
    if (count === 0) {
      expandedId.value = undefined
      prevSectionCount = 0
      return
    }

    const latest = latestSectionId(sections.value)
    if (count > prevSectionCount && latest) {
      expandedId.value = latest
    } else if (prevSectionCount === 0 && latest) {
      expandedId.value = latest
    }

    prevSectionCount = count
  },
  { immediate: true },
)

function onExpandedIdChange(value: string | number | undefined) {
  expandedId.value = value
}
</script>

<style scoped>
.structured-debug-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.structured-debug-timeline {
  width: 100%;
}

.structured-debug-section-body {
  font-size: 14px;
  line-height: 1.5;
}

.structured-debug-section-body--empty {
  min-height: 1.25em;
}

.structured-debug-section-body__placeholder {
  font-size: 13px;
  color: var(--ui-text-muted);
  font-style: italic;
}

.structured-debug-section-outputs {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-border);
}

.structured-debug-outputs {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-border);
}
</style>
