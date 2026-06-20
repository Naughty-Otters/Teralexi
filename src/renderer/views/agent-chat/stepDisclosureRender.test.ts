import { describe, expect, it } from 'vitest'
import { renderStepDisclosureHtml } from './stepDisclosureRender'

describe('stepDisclosureRender', () => {
  it('returns empty html when body is blank', () => {
    expect(renderStepDisclosureHtml('Title', '')).toBe('')
    expect(renderStepDisclosureHtml('Title', '   ')).toBe('')
  })

  it('renders round toggle disclosure with escaped title', () => {
    const html = renderStepDisclosureHtml('Step <1>', '<p>body</p>', { open: false })
    expect(html).toContain('class="step-disclosure"')
    expect(html).toContain('class="step-disclosure__icon"')
    expect(html).toContain('Step &lt;1&gt;')
    expect(html).not.toContain(' open')
    expect(html).toContain('<p>body</p>')
  })

  it('marks active disclosures and opens by default', () => {
    const html = renderStepDisclosureHtml('Running', '<p>x</p>', { active: true })
    expect(html).toContain('step-disclosure--active')
    expect(html).toContain(' open')
  })
})
