import { describe, expect, it } from 'vitest'
import { AGENT_DEFAULTS, AGENT_ERRORS, ENGINE_LOG } from '@main/agent/config'

describe('agent constants', () => {
  it('exposes defaults', () => {
    expect(AGENT_DEFAULTS.USER_ID).toBe('default')
    expect(AGENT_DEFAULTS.RESPONSE_LANGUAGE).toBe('English')
  })

  it('formats agent not found error', () => {
    expect(AGENT_ERRORS.NOT_FOUND.replace('{agentId}', 'x')).toBe(
      'Agent not found: x',
    )
  })

  it('defines engine log message keys', () => {
    expect(ENGINE_LOG.COMPLETED).toContain('completed')
    expect(ENGINE_LOG.STOP_REQUESTED).toContain('Stop')
  })
})
