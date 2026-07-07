import type { UIMessage, TextUIPart } from '@teralexi-ai'

export type { BubblePdfDocumentKind } from './bubblePdfExportHelpers'
export {
  bubblePdfDefaultFileName,
  bubblePdfKindForSection,
  exportBubbleMarkdownAsPdf,
} from './bubblePdfExportHelpers'

export function assistantTextPartMarkdown(
  message: UIMessage,
  part: unknown,
  getStreamingText?: (msg: UIMessage, part: TextUIPart) => string | undefined,
): string {
  if ((part as { type?: string }).type !== 'text') return ''
  const textPart = part as TextUIPart
  const overrideText = getStreamingText?.(message, textPart)
  return (overrideText ?? textPart.text ?? '').trim()
}
