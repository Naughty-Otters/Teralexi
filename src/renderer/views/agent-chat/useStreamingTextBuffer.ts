import { ref, shallowRef } from 'vue'
import type { UIMessage } from '@openfde-ai'

export type StreamingTextTarget = {
  messageId: string
  partId: string
}

function extractActiveStreamingText(
  msg: UIMessage,
): { partId: string; text: string } | null {
  if (msg.role !== 'assistant') return null
  let fallback: { partId: string; text: string } | null = null
  for (const part of msg.parts) {
    if (part.type !== 'text') continue
    const row = {
      partId: (part as { id?: string }).id ?? 'text-0',
      text: part.text ?? '',
    }
    fallback = row
    if (part.state === 'streaming') return row
  }
  return fallback
}

/**
 * Decouples ingress text from painted DOM: internal buffer updates immediately;
 * `displayText` flushes at most once per animation frame.
 */
export function useStreamingTextBuffer() {
  const displayText = ref('')
  const activeTarget = shallowRef<StreamingTextTarget | null>(null)

  let pendingText = ''
  let rafHandle: number | null = null

  function flushToDisplay(): void {
    rafHandle = null
    displayText.value = pendingText
  }

  function scheduleDisplayFlush(): void {
    if (rafHandle != null) return
    if (typeof requestAnimationFrame === 'function') {
      rafHandle = requestAnimationFrame(flushToDisplay)
    } else {
      flushToDisplay()
    }
  }

  function syncFromMessage(msg: UIMessage | null): void {
    if (!msg) {
      clear()
      return
    }
    const extracted = extractActiveStreamingText(msg)
    if (!extracted) {
      clear()
      return
    }
    activeTarget.value = {
      messageId: msg.id,
      partId: extracted.partId,
    }
    pendingText = extracted.text
    scheduleDisplayFlush()
  }

  function clear(): void {
    activeTarget.value = null
    pendingText = ''
    displayText.value = ''
    if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafHandle)
    }
    rafHandle = null
  }

  function flushNow(): void {
    if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafHandle)
    }
    rafHandle = null
    displayText.value = pendingText
  }

  function textForMessage(msg: UIMessage, fallbackText: string): string {
    const target = activeTarget.value
    if (!target || target.messageId !== msg.id) return fallbackText
    const partId = (msg.parts.find(
      (part) => part.type === 'text' && (part as { id?: string }).id === target.partId,
    ) as { id?: string } | undefined)?.id
    if (partId !== target.partId) return fallbackText
    return displayText.value || fallbackText
  }

  return {
    displayText,
    activeTarget,
    syncFromMessage,
    clear,
    flushNow,
    textForMessage,
  }
}
