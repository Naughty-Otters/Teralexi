import DOMPurify from 'dompurify'

/**
 * Sanitize rendered markdown HTML with DOMPurify.
 * Forces rel="noopener noreferrer" on all external links.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote', 'pre', 'code', 'kbd', 'samp',
      'a', 'img',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'div', 'span', 'section', 'article', 'header', 'footer', 'nav',
      'hr', 'details', 'summary',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel', 'width', 'height', 'colspan', 'rowspan'],
    FORCE_BODY: true,
  })
}

/**
 * Inject copy buttons into all <pre> blocks inside `container`.
 * Safe to call multiple times (skips blocks that already have a button).
 */
export function injectCodeCopyButtons(container: HTMLElement): void {
  const pres = container.querySelectorAll<HTMLPreElement>('pre')
  pres.forEach((pre) => {
    if (pre.querySelector('.code-copy-btn')) return
    const btn = document.createElement('button')
    btn.className = 'code-copy-btn'
    btn.textContent = 'Copy'
    btn.setAttribute('aria-label', 'Copy code')
    btn.addEventListener('click', () => {
      const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
      void navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!'
        btn.classList.add('code-copy-btn--ok')
        setTimeout(() => {
          btn.textContent = 'Copy'
          btn.classList.remove('code-copy-btn--ok')
        }, 2000)
      })
    })
    pre.style.position = 'relative'
    pre.appendChild(btn)
  })
}

/**
 * While a step is still streaming, partial markdown can contain unclosed fences or
 * stray backticks. Wrap the buffer in a fenced block that uses more backticks than
 * any run inside the content so MarkdownIt renders safely.
 */
export function wrapStreamingContentForMarkdown(text: string): string {
  const body = text.replace(/\r\n/g, '\n')
  if (!body.trim()) return ''

  let fence = '```'
  while (body.includes(fence)) {
    fence += '`'
  }

  return `${fence}markdown\n${body}\n${fence}`
}
