import { describe, expect, it } from 'vitest'
import { LINK_EXPAND, STEP_ERRORS } from './pipeline'

describe('step constants', () => {
  it('formats tool errors', () => {
    expect(STEP_ERRORS.TOOL_NOT_FOUND.replace('{toolName}', 'x')).toBe(
      'Tool not found: x',
    )
  })

  it('includes link expand messages', () => {
    expect(LINK_EXPAND.NOT_FOUND).toContain('Not found')
  })
})
