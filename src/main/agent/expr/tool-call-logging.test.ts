import { beforeEach, describe, expect, it, vi } from 'vitest'

const info = vi.hoisted(() => vi.fn())
const debug = vi.hoisted(() => vi.fn())
const warn = vi.hoisted(() => vi.fn())
const error = vi.hoisted(() => vi.fn())

vi.mock('@main/logger', () => ({
  createLogger: () => ({ info, debug, warn, error }),
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
    debug.mockClear()
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
    expect(debug).toHaveBeenCalled()
  })

  it('logs start/completed at debug on success', async () => {
    const result = await runLoggedToolExecute(
      { toolName: 'read_file', source: 'skill' },
      { path: 'a.ts' },
      async () => ({ content: 'ok' }),
    )
    expect(result).toEqual({ content: 'ok' })
    expect(debug).toHaveBeenCalledWith(
      'tool call start',
      expect.objectContaining({ toolName: 'read_file' }),
    )
    expect(debug).toHaveBeenCalledWith(
      'tool call completed',
      expect.objectContaining({ toolName: 'read_file' }),
    )
    expect(info).not.toHaveBeenCalled()
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
