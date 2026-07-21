import { describe, expect, it } from 'vitest'
import {
  buildSubAgentBrief,
  mergeSubFlowOutputText,
  parseFilesTouchedFromDiffStat,
  resolveSubAgentSummaryText,
  SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS,
} from './sub-flow-output-text'

describe('mergeSubFlowOutputText', () => {
  it('prefers report and summary stages', () => {
    const outputs = {
      report: 'Report text',
      summary: { summary: 'Summary text' },
      toolLoop: 'Loop text',
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

describe('buildSubAgentBrief', () => {
  it('returns a capped summary and never pastes giant toolLoop blobs unchecked', () => {
    const huge = 'x'.repeat(SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS + 500)
    const brief = buildSubAgentBrief({
      runId: 'run-1',
      agentId: 'coding-explore',
      agentName: 'Explore',
      status: 'completed',
      stepOutputs: { toolLoop: huge },
      worktreeDiffStat: 'src/a.ts | 10 ++\n src/b.ts | 2 +\n 2 files changed',
    })
    expect(brief.summary.length).toBeLessThanOrEqual(
      SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS,
    )
    expect(brief.summary).toContain(
      'do not re-invoke to get more text',
    )
    expect(brief.filesTouched).toEqual(['src/a.ts', 'src/b.ts'])
    expect(brief.openQuestions).toEqual([])
    expect(brief.status).toBe('completed')
  })

  it('prefers report stage over toolLoop', () => {
    expect(
      resolveSubAgentSummaryText({
        report: 'Short report',
        toolLoop: 'long loop',
      }),
    ).toBe('Short report')
  })
})

describe('parseFilesTouchedFromDiffStat', () => {
  it('returns empty for missing stat', () => {
    expect(parseFilesTouchedFromDiffStat(undefined)).toEqual([])
  })
})
