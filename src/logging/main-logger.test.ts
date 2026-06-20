import { describe, expect, it, vi } from 'vitest'

const framework = {
  log: {
    info: vi.fn(),
    child: vi.fn(function child() {
      return framework.log
    }),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    child: vi.fn(),
    raw: { child: vi.fn() },
  })),
  instrumentObjectMethods: <T>(o: T) => o,
  instrumentInstanceMethods: <T>(o: T) => o,
  traceFunction: (_l: unknown, _n: string, fn: (...a: unknown[]) => unknown) => fn,
}

vi.mock('./pino-framework', () => ({
  createLoggingFramework: vi.fn(() => framework),
}))

vi.mock('./agent-run-context', () => ({
  duplicateAgentRunLog: vi.fn(),
}))

vi.mock('./main-process-streams', () => ({
  buildMainProcessLogStreams: vi.fn(() => []),
}))

describe('main-logger', () => {
  it('exports framework helpers', async () => {
    vi.resetModules()
    const mod = await import('./main-logger')
    expect(mod.log).toBeDefined()
    expect(mod.createLogger('test')).toBeDefined()
    const fn = vi.fn(() => 1)
    expect(mod.traceFunction({}, 'fn', fn)(2)).toBe(1)
  })
})
