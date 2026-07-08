import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pino-pretty', () => ({
  default: vi.fn(() => ({ write: vi.fn() })),
}))

const createRotatingPinoFileDestination = vi.fn(() => ({ write: vi.fn(), end: vi.fn() }))

vi.mock('./log-rotation', () => ({
  createRotatingPinoFileDestination,
  DEFAULT_MAX_LOG_BYTES: 10 * 1024 * 1024,
  DEFAULT_MAX_LOG_FILES: 5,
}))

describe('pretty-stream', () => {
  beforeEach(() => {
    vi.resetModules()
    createRotatingPinoFileDestination.mockClear()
    delete process.env.NODE_ENV
  })

  it('usePrettyLogs is true in development', async () => {
    process.env.NODE_ENV = 'development'
    const { usePrettyLogs } = await import('./pretty-stream')
    expect(usePrettyLogs()).toBe(true)
  })

  it('usePrettyLogs is false in production', async () => {
    process.env.NODE_ENV = 'production'
    const { usePrettyLogs } = await import('./pretty-stream')
    expect(usePrettyLogs()).toBe(false)
  })

  it('createAgentRunLogDestination uses rotating file sink in production', async () => {
    process.env.NODE_ENV = 'production'
    const { createAgentRunLogDestination } = await import('./pretty-stream')
    createAgentRunLogDestination('/tmp/run.log')
    expect(createRotatingPinoFileDestination).toHaveBeenCalledWith('/tmp/run.log')
  })

  it('createPinoFileDestination uses rotating file sink', async () => {
    const { createPinoFileDestination } = await import('./pretty-stream')
    createPinoFileDestination('/tmp/main.log')
    expect(createRotatingPinoFileDestination).toHaveBeenCalledWith(
      '/tmp/main.log',
      undefined,
    )
  })

  it('createAgentRunLogDestination uses pino-pretty with file path in development', async () => {
    process.env.NODE_ENV = 'development'
    const pinoPretty = (await import('pino-pretty')).default
    const { createAgentRunLogDestination } = await import('./pretty-stream')

    createAgentRunLogDestination('/tmp/run.log')

    expect(createRotatingPinoFileDestination).not.toHaveBeenCalled()
    expect(pinoPretty).toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/tmp/run.log' }),
    )
  })
})
