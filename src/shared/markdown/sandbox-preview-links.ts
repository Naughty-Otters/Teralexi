import type MarkdownIt from 'markdown-it'
import { escapeAttr } from '@shared/diagram/svg-utils'

export const SANDBOX_PREVIEW_LINK_CLASS = 'sandbox-preview-link'
export const SANDBOX_PREVIEW_URL_ATTR = 'data-sandbox-preview-url'

export function isSandboxPreviewHref(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed || trimmed === '#') return false
  return trimmed.toLowerCase().startsWith('file://')
}

/** Rewrite file:// anchors so Electron does not navigate the main window in-place. */
export function applySandboxPreviewLinkPlugin(md: MarkdownIt): void {
  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const href = token.attrGet('href') ?? ''
    if (isSandboxPreviewHref(href)) {
      token.attrJoin('class', SANDBOX_PREVIEW_LINK_CLASS)
      token.attrSet(SANDBOX_PREVIEW_URL_ATTR, href)
      token.attrSet('href', '#')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }
}

/** Post-process rendered HTML (covers links markdown-it would not tokenize). */
export function rewriteSandboxPreviewLinksInHtml(html: string): string {
  return html.replace(
    /<a\b([^>]*?)\bhref="(file:\/\/[^"]+)"([^>]*)>/gi,
    (_match, before, fileUrl, after) => {
      const combined = `${before}${after}`
      const classRe = /\bclass="([^"]*)"/i
      const classMatch = classRe.exec(combined)
      let otherAttrs = combined
      let className = SANDBOX_PREVIEW_LINK_CLASS
      if (classMatch) {
        className = `${classMatch[1]} ${SANDBOX_PREVIEW_LINK_CLASS}`.trim()
        otherAttrs = combined.replace(classRe, '')
      }
      otherAttrs = otherAttrs.replace(/\s+/g, ' ').trim()
      const trailing = otherAttrs ? ` ${otherAttrs}` : ''
      return `<a href="#" class="${className}" ${SANDBOX_PREVIEW_URL_ATTR}="${escapeAttr(fileUrl)}"${trailing}>`
    },
  )
}
