import {
  HEAD_TAIL_KEEP_CHARS,
  truncateHeadTail,
} from '@shared/text/truncate-head-tail'

export { HEAD_TAIL_KEEP_CHARS as STREAMING_BUBBLE_TEXT_KEEP_CHARS }

/**
 * While a bubble is streaming, keep first/last 200 chars and replace the
 * middle with `\n....\n` so markdown/DOM work stays bounded.
 */
export function limitTextForStreamingBubble(
  text: string,
  keepChars: number = HEAD_TAIL_KEEP_CHARS,
): string {
  return truncateHeadTail(text, keepChars)
}

export function isUiMessageTextStreaming(message: {
  parts: readonly { type?: string; state?: string }[]
}): boolean {
  return message.parts.some(
    (part) => part.type === 'text' && part.state === 'streaming',
  )
}
