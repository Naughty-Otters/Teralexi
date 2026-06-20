export type StepOutputLinkView = {
  label: string
  url: string
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderLinkCard(link: StepOutputLinkView): string {
  const url = escHtml(link.url)
  const label = escHtml(link.label)
  return `<li class="step-output-link-card">
<a href="${url}" class="sandbox-preview-link step-output-link-card__label">${label}</a>
<a href="${url}" class="sandbox-preview-link step-output-link-preview step-output-link-preview--loading" data-step-output-preview-url="${url}" aria-label="Open ${label}">
<span class="step-output-link-preview__status">Loading preview…</span>
</a>
</li>`
}

export function renderStepOutputLinksHtml(
  links: readonly StepOutputLinkView[] | undefined,
): string {
  if (!links?.length) return ''
  const items = links.map((link) => renderLinkCard(link)).join('')
  return `<div class="step-output-links"><ul class="step-output-links__list">${items}</ul></div>`
}

/** Strip legacy markdown output blocks appended before structured outputLinks existed. */
export function stripLegacyOutputsMarkdown(content: string): string {
  const marker = '\n\n**Outputs:**'
  const idx = content.indexOf(marker)
  return idx >= 0 ? content.slice(0, idx).trimEnd() : content
}
