import { beforeEach, describe, expect, it, vi } from 'vitest'

const info = vi.hoisted(() => vi.fn())
const warn = vi.hoisted(() => vi.fn())
const error = vi.hoisted(() => vi.fn())

vi.mock('@main/logger', () => ({
  createLogger: () => ({ info: info, warn: warn, error: error, debug: vi.fn() }),
}))

import { runLoggedToolExecute } from './tool-call-logging'
import { serializeForToolLog } from './tool-log-utils'

describe('serializeForToolLog', () => {
  it('truncates large JSON', () => {
    const out = serializeForToolLog({ x: 'y'.repeat(10_000) }, 100) as Record<
      string,
      unknown
    >
    expect(out._truncated).toBe(true)
  })
})

describe('runLoggedToolExecute', () => {
  beforeEach(() => {
    info.mockClear()
    warn.mockClear()
    error.mockClear()
  })

  it('rethrows thrown errors after logging', async () => {
    await expect(
      runLoggedToolExecute(
        { toolName: 'read_file', source: 'skill' },
        {},
        async () => {
          throw new Error('disk full')
        },
      ),
    ).rejects.toThrow('disk full')
    expect(error).toHaveBeenCalled()
    expect(info).toHaveBeenCalled()
  })

  it('logs warn for soft failure results without throwing', async () => {
    const result = await runLoggedToolExecute(
      { toolName: 'write_file', source: 'skill' },
      {},
      async () => ({ success: false, error: 'denied' }),
    )
    expect(result).toEqual({ success: false, error: 'denied' })
    expect(warn).toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
