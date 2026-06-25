import MarkdownIt from 'markdown-it'
import { markdownToPlainText } from '@shared/markdown/markdown-to-plain-text'

const printMarkdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

export async function copyBubbleMarkdownContent(
  markdown: string,
): Promise<boolean> {
  const source = markdown.trim()
  if (!source || !navigator.clipboard) return false

  const plainText = markdownToPlainText(source)
  if (!plainText) return false

  const html = printMarkdown.render(source)

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
      return true
    } catch {
      // Fall back to plain text only.
    }
  }

  if (!navigator.clipboard.writeText) return false
  await navigator.clipboard.writeText(plainText)
  return true
}

export function printBubbleMarkdownContent(args: {
  markdown: string
  title?: string
}): void {
  const markdown = args.markdown.trim()
  if (!markdown) return

  const title = args.title?.trim() || 'Message'
  const bodyHtml = printMarkdown.render(markdown)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:none;'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!win || !doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.55;
  color: #111;
  padding: 24px;
  max-width: 720px;
  margin: 0 auto;
}
pre {
  overflow-x: auto;
  background: #f5f5f5;
  padding: 10px 12px;
  border-radius: 6px;
}
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
blockquote {
  margin: 0.75em 0;
  padding-left: 1em;
  border-left: 3px solid #ddd;
  color: #444;
}
@media print {
  body { padding: 0; max-width: none; }
}
</style>
</head>
<body>${bodyHtml}</body>
</html>`)
  doc.close()

  const cleanup = (): void => {
    iframe.remove()
  }

  const triggerPrint = (): void => {
    win.focus()
    win.print()
    window.setTimeout(cleanup, 1000)
  }

  if (doc.readyState === 'complete') {
    triggerPrint()
    return
  }

  iframe.addEventListener('load', triggerPrint, { once: true })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
