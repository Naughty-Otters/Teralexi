import type { UIMessage, TextUIPart } from '@teralexi-ai'
import type MarkdownIt from 'markdown-it'
import { resolveDiagramBlocksInHtml } from '@shared/markdown/create-markdown-it'
import { rewriteSandboxPreviewLinksInHtml } from '@shared/markdown/sandbox-preview-links'
import { renderAssistantMessageHtml } from '../../assistantStructuredRender'
import {
  getCachedAssistantHtml,
  setCachedAssistantHtml,
} from './assistantHtmlCache'
import { chatUiPerfMark, chatUiPerfMarkEnd } from '../../perf/chatUiPerf'

export function isAssistantMessageStreaming(m: UIMessage): boolean {
  if (m.role !== 'assistant') return false
  return m.parts.some(
    (p) => p.type === 'text' && p.state === 'streaming',
  )
}

export function createAssistantTextPartHtmlRenderer(opts: {
  markdown: MarkdownIt
  getStructuredDebug: () => boolean
  getStreamingText?: (msg: UIMessage, part: TextUIPart) => string | undefined
}) {
  return function assistantTextPartHtml(msg: UIMessage, part: unknown): string {
    if ((part as { type?: string }).type !== 'text') return ''
    const textPart = part as TextUIPart
    const streaming = textPart.state === 'streaming'
    const overrideText = opts.getStreamingText?.(msg, textPart)
    const text = overrideText ?? textPart.text ?? ''
    if (!text.trim()) {
      return ''
    }

    if (!streaming) {
      const partIndex = msg.parts.indexOf(textPart)
      const cached = getCachedAssistantHtml(msg.id, partIndex, text)
      if (cached !== undefined) return cached
    }

    chatUiPerfMark('markdown')
    let html = renderAssistantMessageHtml(text, opts.markdown, {
      isStreaming: streaming,
      structuredDebug: opts.getStructuredDebug(),
    })
    if (!streaming) {
      html = rewriteSandboxPreviewLinksInHtml(resolveDiagramBlocksInHtml(html))
    }
    chatUiPerfMarkEnd('markdown')

    if (!streaming) {
      const partIndex = msg.parts.indexOf(textPart)
      setCachedAssistantHtml(msg.id, partIndex, text, html)
    }
    return html
  }
}
