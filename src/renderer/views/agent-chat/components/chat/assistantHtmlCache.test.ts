import { describe, expect, it } from 'vitest'

import {
  contentHash,
  messagePartsRevision,
} from './assistantHtmlCache'

describe('messagePartsRevision', () => {
  it('changes when text content grows without stringifying the parts tree', () => {
    const msg = {
      id: 'm1',
      parts: [{ type: 'text', text: 'hi', state: 'streaming' }],
    }
    const a = messagePartsRevision(msg)
    msg.parts[0].text = 'hi there'
    const b = messagePartsRevision(msg)
    expect(a).not.toBe(b)
    expect(b).toContain(contentHash('hi there'))
  })

  it('changes when tool output shape changes', () => {
    const msg = {
      id: 'm1',
      parts: [
        {
          type: 'tool-bash',
          toolCallId: 't1',
          state: 'input-available',
          output: { resultType: 'unknown', a: 1 },
        },
      ],
    }
    const a = messagePartsRevision(msg)
    ;(msg.parts[0] as { state: string; output: Record<string, unknown> }).state =
      'output-available'
    ;(msg.parts[0] as { output: Record<string, unknown> }).output = {
      resultType: 'unknown',
      a: 1,
      b: 2,
    }
    const b = messagePartsRevision(msg)
    expect(a).not.toBe(b)
  })
})
