import { describe, expect, it } from 'vitest'
import { mergeSubFlowOutputText } from './sub-flow-output-text'

describe('mergeSubFlowOutputText', () => {
  it('prefers summary or report based on merge mode', () => {
    const outputs = {
      summary: { summary: 'Summary text' },
      report: 'Report text',
      toolLoop: 'Tool loop text',
    }

    expect(mergeSubFlowOutputText(outputs, 'summary')).toBe('Summary text')
    expect(mergeSubFlowOutputText(outputs, 'report')).toBe('Report text')
    expect(mergeSubFlowOutputText(outputs, 'all')).toContain('Report text')
    expect(mergeSubFlowOutputText(outputs, 'all')).toContain('Summary text')
    expect(mergeSubFlowOutputText({}, 'report')).toContain('no report output')
    expect(mergeSubFlowOutputText({ toolLoop: 'Loop only' }, 'summary')).toBe(
      'Loop only',
    )
    expect(mergeSubFlowOutputText({ report: 'Report only' }, 'summary')).toBe(
      'Report only',
    )
  })
})
