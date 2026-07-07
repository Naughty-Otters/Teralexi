import { renderBasicMarkdown } from './basic-markdown-it'

function normalizePlainText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Best-effort HTML → plain text when DOM is unavailable (tests, SSR). */
export function htmlToPlainText(html: string): string {
  if (typeof document !== 'undefined') {
    return normalizePlainText(extractPlainTextFromDom(html))
  }

  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|blockquote|pre|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(
      /<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, inner: string) => {
        const label = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '').trim())
        if (!label) return href
        if (!href || href.startsWith('#') || href === label) return label
        return `${label} (${href})`
      },
    )
    .replace(/<[^>]+>/g, '')

  return normalizePlainText(decodeHtmlEntities(text))
}

function extractPlainTextFromDom(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = html
  return walkPlainText(root)
}

function walkPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text.trim() && !isInsidePre(node)) return ''
    return text
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  if (tag === 'br') return '\n'

  if (tag === 'a') {
    const label = Array.from(el.childNodes).map(walkPlainText).join('').trim()
    const href = el.getAttribute('href')?.trim()
    if (label && href && !href.startsWith('#') && href !== label) {
      return `${label} (${href})`
    }
    return label
  }

  if (tag === 'hr') return '\n---\n'

  const inner = Array.from(el.childNodes).map(walkPlainText).join('')

  if (tag === 'li') return `• ${inner.trim()}\n`
  if (/^h[1-6]$/.test(tag)) return `${inner.trim()}\n\n`
  if (tag === 'p' || tag === 'blockquote') return `${inner.trim()}\n\n`
  if (tag === 'pre') return `${inner}\n\n`

  return inner
}

function isInsidePre(node: Node): boolean {
  let current: Node | null = node.parentNode
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as HTMLElement).tagName.toLowerCase()
      if (tag === 'pre' || tag === 'code') return true
    }
    current = current.parentNode
  }
  return false
}

/** Readable plain text for clipboard targets that do not render Markdown. */
export async function markdownToPlainText(markdown: string): Promise<string> {
  const source = markdown.trim()
  if (!source) return ''
  return htmlToPlainText(await renderBasicMarkdown(source))
}
