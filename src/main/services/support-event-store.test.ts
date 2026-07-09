import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const logsDir = join(tmpdir(), `support-events-test-${process.pid}`)

vi.mock('@config/teralexi-home', () => ({
  getTeralexiLogsDir: () => logsDir,
}))

describe('support-event-store', () => {
  afterEach(async () => {
    vi.resetModules()
    rmSync(logsDir, { recursive: true, force: true })
  })

  it('records events in memory and appends to jsonl', async () => {
    const store = await import('./support-event-store')
    store.recordSupportEvent('renderer', {
      message: 'Renderer crash',
      stack: 'Error: boom',
    })

    const recent = store.listRecentSupportEvents()
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({
      source: 'renderer',
      message: 'Renderer crash',
      stack: 'Error: boom',
    })
    expect(recent[0]?.id).toBeTruthy()
    expect(recent[0]?.at).toBeTruthy()

    const file = store.readSupportEventsFile()
    expect(file).toContain('Renderer crash')
    expect(file.trim().split('\n')).toHaveLength(1)
  })

  it('keeps only the most recent ring buffer entries', async () => {
    const store = await import('./support-event-store')
    for (let i = 0; i < 55; i += 1) {
      store.recordSupportEvent('main', { message: `event-${i}` })
    }

    const recent = store.listRecentSupportEvents()
    expect(recent).toHaveLength(50)
    expect(recent[0]?.message).toBe('event-5')
    expect(recent[49]?.message).toBe('event-54')
  })

  it('registers main-process handlers for unhandled errors', async () => {
    const store = await import('./support-event-store')
    const rejection = vi.fn()
    const exception = vi.fn()
    process.on('unhandledRejection', rejection)
    process.on('uncaughtException', exception)

    store.registerMainProcessSupportHandlers()
    process.emit('unhandledRejection', new Error('async failure'))
    process.emit('uncaughtException', new Error('sync failure'))

    const messages = store
      .listRecentSupportEvents()
      .map((entry) => entry.message)
    expect(messages).toContain('async failure')
    expect(messages).toContain('sync failure')

    process.off('unhandledRejection', rejection)
    process.off('uncaughtException', exception)
  })

  it('returns empty file contents when log file is missing', async () => {
    const store = await import('./support-event-store')
    mkdirSync(logsDir, { recursive: true })
    expect(store.readSupportEventsFile()).toBe('')
  })

  it('reads persisted jsonl from disk', async () => {
    const store = await import('./support-event-store')
    store.recordSupportEvent('main', { message: 'persisted' })

    const contents = readFileSync(
      join(logsDir, 'support-events.jsonl'),
      'utf8',
    )
    expect(contents).toContain('persisted')
    expect(store.readSupportEventsFile()).toBe(contents)
  })
})
