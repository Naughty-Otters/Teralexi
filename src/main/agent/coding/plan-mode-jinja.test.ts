import { describe, expect, it } from 'vitest'
import { renderJinja2 } from './plan-mode-jinja'

describe('renderJinja2', () => {
  it('interpolates variables', () => {
    expect(renderJinja2('Hello {{ name }}', { name: 'world' })).toBe('Hello world')
  })

  it('renders for loops with loop.index', () => {
    const tpl = '{% for item in items %}{{ loop.index }}. {{ item }}\n{% endfor %}'
    expect(renderJinja2(tpl, { items: ['a', 'b'] })).toBe('1. a\n2. b\n')
  })

  it('renders if/else branches', () => {
    const tpl = '{% if items %}yes{% else %}no{% endif %}'
    expect(renderJinja2(tpl, { items: [] })).toBe('no')
    expect(renderJinja2(tpl, { items: ['x'] })).toBe('yes')
  })

  it('evaluates inequality conditions', () => {
    const tpl =
      '{% for step in steps %}{{ step.content }}{% if step.status != \'pending\' %} ({{ step.status }}){% endif %}\n{% endfor %}'
    expect(
      renderJinja2(tpl, {
        steps: [
          { content: 'A', status: 'pending' },
          { content: 'B', status: 'completed' },
        ],
      }),
    ).toBe('A\nB (completed)\n')
  })
})
