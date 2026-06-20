export function renderStepDisclosureHtml(
  title: string,
  bodyHtml: string,
  opts?: { open?: boolean; active?: boolean },
): string {
  if (!bodyHtml.trim()) return ''
  const open = opts?.open !== false
  const active = opts?.active === true
  const openAttr = open ? ' open' : ''
  const activeClass = active ? ' step-disclosure--active' : ''
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<details class="step-disclosure${activeClass}"${openAttr}><summary class="step-disclosure__header"><span class="step-disclosure__toggle"><span class="step-disclosure__icon" aria-hidden="true"></span><span class="step-disclosure__title">${safeTitle}</span></span></summary><div class="step-disclosure__content">${bodyHtml}</div></details>`
}
