import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pino-pretty', () => ({
  default: vi.fn(() => ({ write: vi.fn() })),
}))

vi.mock('pino', () => ({
  default: {
    destination: vi.fn(() => ({ write: vi.fn() })),
  },
}))

describe('pretty-stream', () => {
  beforeEach(() => {
    vi.resetModules()
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

  it('createAgentRunLogDestination uses pino.destination in production', async () => {
    process.env.NODE_ENV = 'production'
    const pino = (await import('pino')).default
    const { createAgentRunLogDestination } = await import('./pretty-stream')
    createAgentRunLogDestination('/tmp/run.log')
    expect(pino.destination).toHaveBeenCalledWith(
      expect.objectContaining({ dest: '/tmp/run.log' }),
    )
  })

  it('createAgentRunLogDestination uses pino-pretty in development', async () => {
    process.env.NODE_ENV = 'development'
    const pinoPretty = (await import('pino-pretty')).default
    const { createAgentRunLogDestination } = await import('./pretty-stream')
    createAgentRunLogDestination('/tmp/run.log')
    expect(pinoPretty).toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/tmp/run.log' }),
    )
  })
})
