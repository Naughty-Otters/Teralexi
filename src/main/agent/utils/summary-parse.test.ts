import { describe, expect, it } from 'vitest'
import {
  formatSummaryForContext,
  formatSummaryMarkdown,
  normalizeSummaryOutput,
  parseSummaryJson,
  summaryDisplayText,
  summaryFromStepData,
} from './summary-parse'

describe('parseSummaryJson', () => {
  it('parses structured summary JSON', () => {
    const raw = JSON.stringify({
      summary: 'Tests passed.',
      goalAchieved: true,
      waysToAchieveGoalBetter: '',
    })
    expect(parseSummaryJson(raw)).toEqual({
      summary: 'Tests passed.',
      goalAchieved: true,
      waysToAchieveGoalBetter: '',
      shouldMemorize: false,
      memorizeReason: '',
    })
  })

  it('parses snake_case keys', () => {
    const raw = JSON.stringify({
      summary: 'Partial work.',
      goal_achieved: false,
      ways_to_achieve_goal_better:
        'Narrow the scope and re-run the deploy step.',
    })
    const parsed = parseSummaryJson(raw)
    expect(parsed.goalAchieved).toBe(false)
    expect(parsed.waysToAchieveGoalBetter).toContain('deploy')
  })

  it('parses shouldMemorize and memorizeReason', () => {
    const raw = JSON.stringify({
      summary: 'User prefers JSON reports.',
      goalAchieved: true,
      waysToAchieveGoalBetter: '',
      should_memorize: true,
      memorize_reason: 'Always deliver reports as JSON for this workspace.',
    })
    expect(parseSummaryJson(raw)).toMatchObject({
      shouldMemorize: true,
      memorizeReason: 'Always deliver reports as JSON for this workspace.',
    })
  })

  it('clears memorizeReason when shouldMemorize is false', () => {
    const raw = JSON.stringify({
      summary: 'Done.',
      goalAchieved: true,
      shouldMemorize: false,
      memorizeReason: 'should be dropped',
    })
    const parsed = parseSummaryJson(raw)
    expect(parsed.shouldMemorize).toBe(false)
    expect(parsed.memorizeReason).toBe('')
  })

  it('maps legacy doAgain string to waysToAchieveGoalBetter', () => {
    const raw = JSON.stringify({
      summary: 'Failed.',
      goalAchieved: false,
      do_again: 'Re-run with updated env vars.',
    })
    const parsed = parseSummaryJson(raw)
    expect(parsed.waysToAchieveGoalBetter).toContain('env vars')
  })

  it('falls back to prose when not JSON', () => {
    expect(parseSummaryJson('Plain summary text.')).toEqual({
      summary: 'Plain summary text.',
      goalAchieved: false,
      waysToAchieveGoalBetter: '',
      shouldMemorize: false,
      memorizeReason: '',
    })
  })

  it('parses fenced JSON and string boolean goal flags', () => {
    const raw =
      'Here is the result:\n```json\n{"summary":"Done","goal_achieved":"yes"}\n```'
    expect(parseSummaryJson(raw).goalAchieved).toBe(true)
    expect(
      parseSummaryJson('{"summary":"Nope","goal_achieved":"no"}').goalAchieved,
    ).toBe(false)
  })

  it('throws when response is empty', () => {
    expect(() => parseSummaryJson('   ')).toThrow(/empty/)
  })
})

describe('formatSummaryMarkdown', () => {
  it('includes ways to achieve goal better', () => {
    const md = formatSummaryMarkdown(
      normalizeSummaryOutput({
        summary: 'Done.',
        goalAchieved: false,
        waysToAchieveGoalBetter: 'Verify config paths before deploying again.',
      }),
    )
    expect(md).toContain('- Goal achieved: No')
    expect(md).toContain('- What else can be done to achieve the goal better:')
    expect(md).not.toContain('## Try again')
    expect(md).toContain('config paths')
  })

  it('omits ways section when empty', () => {
    const md = formatSummaryMarkdown({
      summary: 'Done.',
      goalAchieved: true,
      waysToAchieveGoalBetter: '',
      shouldMemorize: false,
      memorizeReason: '',
    })
    expect(md).not.toContain(
      '- What else can be done to achieve the goal better:',
    )
  })

  it('includes retain-for-future section when shouldMemorize', () => {
    const md = formatSummaryMarkdown({
      summary: 'Deployed.',
      goalAchieved: true,
      waysToAchieveGoalBetter: '',
      shouldMemorize: true,
      memorizeReason: 'Staging URL must use port 8443.',
    })
    expect(md).toContain('- Retain for future runs: Yes')
    expect(md).toContain('Staging URL must use port 8443')
  })
})

describe('summary helpers', () => {
  it('summaryDisplayText prefers rendered output', () => {
    expect(
      summaryDisplayText({
        summary: 'raw',
        goalAchieved: true,
        waysToAchieveGoalBetter: '',
        shouldMemorize: false,
        memorizeReason: '',
        rendered: 'Rendered summary',
      }),
    ).toBe('Rendered summary')
  })

  it('formatSummaryForContext renders markdown from step data', () => {
    const normalized = summaryFromStepData({
      summary: 'Done',
      goalAchieved: true,
      waysToAchieveGoalBetter: '',
      shouldMemorize: false,
      memorizeReason: '',
    })
    expect(formatSummaryForContext(normalized)).toContain('- Summary: Done')
  })
})
