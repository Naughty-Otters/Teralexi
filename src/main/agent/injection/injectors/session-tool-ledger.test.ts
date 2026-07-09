import { describe, expect, it, vi } from 'vitest'
import {
  formatSessionReadLedger,
  sessionToolLedgerInjector,
} from './session-tool-ledger'

describe('formatSessionReadLedger', () => {
  it('returns null for an empty path list', () => {
    expect(formatSessionReadLedger([])).toBeNull()
  })

  it('formats paths as a markdown ledger block', () => {
    const block = formatSessionReadLedger(['src/a.ts', 'src/b.ts'])
    expect(block).toContain('### Session read ledger')
    expect(block).toContain('`src/a.ts`')
    expect(block).toContain('`src/b.ts`')
  })

  it('truncates long ledgers with an overflow line', () => {
    const paths = Array.from({ length: 35 }, (_, i) => `file-${i}.ts`)
    const block = formatSessionReadLedger(paths)!
    expect(block).toContain('file-0.ts')
    expect(block).toContain('file-29.ts')
    expect(block).not.toContain('file-30.ts')
    expect(block).toContain('…and 5 more')
  })
})

describe('sessionToolLedgerInjector', () => {
  const listReadPaths = vi.fn(() => ['src/main.ts'])

  const baseCtx = {
    agentFlow: {
      toolReadCache: { listReadPaths },
    },
    opts: { conversationId: 'conv-1' },
  }

  it('applies only for coding agent tool loops with prior reads', () => {
    expect(
      sessionToolLedgerInjector.applies({
        profile: { isCodingAgent: true, stage: 'toolLoop' },
        ctx: baseCtx,
      } as never),
    ).toBe(true)

    expect(
      sessionToolLedgerInjector.applies({
        profile: { isCodingAgent: true, stage: 'todoExecution' },
        ctx: baseCtx,
      } as never),
    ).toBe(true)

    expect(
      sessionToolLedgerInjector.applies({
        profile: { isCodingAgent: false, stage: 'toolLoop' },
        ctx: baseCtx,
      } as never),
    ).toBe(false)

    expect(
      sessionToolLedgerInjector.applies({
        profile: { isCodingAgent: true, stage: 'planning' },
        ctx: baseCtx,
      } as never),
    ).toBe(false)

    listReadPaths.mockReturnValueOnce([])
    expect(
      sessionToolLedgerInjector.applies({
        profile: { isCodingAgent: true, stage: 'toolLoop' },
        ctx: baseCtx,
      } as never),
    ).toBe(false)
  })

  it('injects the formatted ledger block', () => {
    const block = sessionToolLedgerInjector.injectInstructions!({
      ctx: baseCtx,
    } as never)
    expect(block).toContain('`src/main.ts`')
  })
})
