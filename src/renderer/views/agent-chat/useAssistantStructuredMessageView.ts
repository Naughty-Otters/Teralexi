import type { UIMessage } from '@teralexi-ai'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useLazyStandardMarkdown } from '@renderer/composables/useLazyStandardMarkdown'
import { prepareMarkdownSource } from '@shared/markdown/prepare-markdown-source'
import { applyStatusBadges } from './assistantStructuredRender'
import { chatUiBubbleTextKeepChars } from './chatUiSettings'
import {
  buildStructuredDebugViewForMessage,
  type StepProgressPartInput,
  type StructuredDebugSection,
  type StructuredDebugView,
} from './structuredDebugViewModel'
import { excludeSubAgentStepProgressParts } from './stepProgressDisplay'

export function useAssistantStructuredMessageView(
  messageSource: MaybeRefOrGetter<UIMessage>,
) {
  const markdown = useLazyStandardMarkdown()

  const message = computed(() => toValue(messageSource))

  const assistantTextRaw = computed(() => {
    const chunks: string[] = []
    for (const part of message.value.parts) {
      if (part.type === 'text') {
        const text = part.text ?? ''
        if (text.trim()) chunks.push(text)
      }
    }
    return chunks.join('\n\n').trim()
  })

  const stepProgressParts = computed((): StepProgressPartInput[] => {
    const out: StepProgressPartInput[] = []
    for (const part of message.value.parts) {
      if (part.type !== 'data-agent-step-progress') continue
      out.push(part as StepProgressPartInput)
    }
    return out
  })

  /** Parent-owned progress only — sub-agent live steps render in {@link ChatSubAgentBubble}. */
  const parentStepProgressParts = computed((): StepProgressPartInput[] =>
    excludeSubAgentStepProgressParts(stepProgressParts.value),
  )

  const isStreaming = computed(() =>
    message.value.parts.some(
      (part) => part.type === 'text' && part.state === 'streaming',
    ),
  )

  const view = computed((): StructuredDebugView | null => {
    void chatUiBubbleTextKeepChars.value
    if (!markdown.value) return null
    return buildStructuredDebugViewForMessage({
      raw: assistantTextRaw.value,
      stepProgressParts: parentStepProgressParts.value,
      markdown: markdown.value,
      isStreaming: isStreaming.value,
    })
  })

  const sections = computed((): readonly StructuredDebugSection[] =>
    view.value?.sections ?? [],
  )

  const fallbackHtml = computed(() => {
    void chatUiBubbleTextKeepChars.value
    const prepared = prepareMarkdownSource(assistantTextRaw.value)
    if (!prepared || !markdown.value) return ''
    return applyStatusBadges(markdown.value.render(prepared))
  })

  return {
    markdown,
    view,
    sections,
    fallbackHtml,
    assistantTextRaw,
    stepProgressParts,
    parentStepProgressParts,
    isStreaming,
  }
}
