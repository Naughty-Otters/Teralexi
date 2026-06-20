import { describe, expect, it } from 'vitest'
import {
  formatCommandOutput,
  stampCommandToolResult,
  stripTerminalCaptureHeaders,
} from './terminal-capture'

describe('terminal-capture', () => {
  it('formats stdout and stderr blocks', () => {
    expect(formatCommandOutput('hello', '')).toBe('--- stdout ---\nhello')
    expect(formatCommandOutput('', 'warn')).toBe('--- stderr ---\nwarn')
    expect(formatCommandOutput('a', 'b')).toBe(
      '--- stdout ---\na\n\n--- stderr ---\nb',
    )
  })

  it('stamps command results and preserves existing capture text', () => {
    expect(stampCommandToolResult({ stdout: 'x' })).toMatchObject({
      output: '--- stdout ---\nx',
      resultContent: '--- stdout ---\nx',
    })

    expect(
      stampCommandToolResult({
        resultContent: '--- stdout ---\nfrom file',
      }),
    ).toMatchObject({
      resultContent: 'from file',
    })

    expect(stampCommandToolResult({})).toEqual({})
  })

  it('strips capture headers from combined text', () => {
    expect(stripTerminalCaptureHeaders('--- stdout ---\nline')).toBe('line')
  })
})
