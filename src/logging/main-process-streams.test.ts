import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }))
vi.mock('@config/teralexi-home', () => ({
  getTeralexiLogsDir: vi.fn(() => '/mock/logs'),
}))
vi.mock('./pretty-stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pretty-stream')>()
  return {
    ...actual,
    createPinoFileDestination: vi.fn(() => ({ write: vi.fn() })),
  }
})

describe('buildMainProcessLogStreams', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('creates stdout, stderr, and file streams once', async () => {
    const { mkdirSync } = await import('node:fs')
    const { buildMainProcessLogStreams } = await vi.importActual<
      typeof import('./main-process-streams')
    >('./main-process-streams')
    const streams = buildMainProcessLogStreams()
    expect(streams).toHaveLength(3)
    expect(streams.map((s) => s.level)).toEqual(['trace', 'warn', 'info'])
    expect(mkdirSync).toHaveBeenCalledWith('/mock/logs', { recursive: true })
    const again = buildMainProcessLogStreams()
    expect(again).toBe(streams)
  })
})
