import { describe, expect, it } from 'vitest'
import {
  agentHasRunnableTools,
  correctMisroutedThinking,
  downgradeAgentCallForInlineDiagram,
  userMessageLooksActionable,
  userMessageLooksLikePlanning,
  userMessageLooksPurelyInformational,
} from './thinking-route-guard'
import type { NormalizedThinkingOutput } from '../utils/thinking-parse'

function directAnswerThinking(
  overrides: Partial<NormalizedThinkingOutput> = {},
): NormalizedThinkingOutput {
  return {
    execution_mode: 'direct_answer',
    goal: 'Answer',
    task: 'Respond',
    context: [],
    response: 'Here is a long explanation without doing the work.',
    ...overrides,
  }
}

describe('userMessageLooksActionable', () => {
  it('detects imperative fix/implement requests', () => {
    expect(userMessageLooksActionable('Fix the login bug in auth.ts')).toBe(true)
    expect(userMessageLooksActionable('Please implement dark mode')).toBe(true)
    expect(userMessageLooksActionable('Can you refactor the agent pipeline?')).toBe(
      true,
    )
  })

  it('allows pure informational questions', () => {
    expect(userMessageLooksActionable('What is Rust?')).toBe(false)
    expect(userMessageLooksActionable('Explain how async works in JavaScript')).toBe(
      false,
    )
    expect(userMessageLooksActionable('Why does this error happen?')).toBe(false)
  })

  it('treats how-to with action verbs as actionable', () => {
    expect(userMessageLooksActionable('How do I fix this test failure?')).toBe(true)
  })
})

describe('userMessageLooksLikePlanning', () => {
  it('detects explicit planning language', () => {
    expect(userMessageLooksLikePlanning('Plan out a migration to React 19')).toBe(
      true,
    )
    expect(userMessageLooksLikePlanning('Break this down before we implement')).toBe(
      true,
    )
  })
})

describe('userMessageLooksPurelyInformational', () => {
  it('detects pure Q&A openers and plot/explain visuals', () => {
    expect(userMessageLooksPurelyInformational('What is Rust?')).toBe(true)
    expect(userMessageLooksPurelyInformational('Explain how async works')).toBe(
      true,
    )
    expect(userMessageLooksPurelyInformational('Explain sin(x)')).toBe(true)
    expect(userMessageLooksPurelyInformational('Plot cos(x) from -pi to pi')).toBe(
      true,
    )
  })

  it('rejects actionable or ambiguous requests', () => {
    expect(userMessageLooksPurelyInformational('Fix the login bug')).toBe(false)
    expect(
      userMessageLooksPurelyInformational('What is the best way to refactor auth?'),
    ).toBe(false)
  })
})

describe('agentHasRunnableTools', () => {
  it('is true when skill tools are configured', () => {
    expect(
      agentHasRunnableTools({
        opts: { skillId: 'demo' },
        runtimeTools: [{ name: 'read_file', source: 'skill' }],
      }),
    ).toBe(true)
  })

  it('is false without tools', () => {
    expect(agentHasRunnableTools({ opts: {}, runtimeTools: [] })).toBe(false)
  })
})

describe('correctMisroutedThinking', () => {
  it('upgrades direct_answer to agent_call for actionable requests', () => {
    const corrected = correctMisroutedThinking(
      directAnswerThinking(),
      'Fix the failing unit test in runtime.test.ts',
    )
    expect(corrected.execution_mode).toBe('agent_call')
    expect(corrected.response).toBeUndefined()
  })

  it('upgrades direct_answer to planning when user asks for a plan', () => {
    const corrected = correctMisroutedThinking(
      directAnswerThinking(),
      'Plan out the auth refactor across multiple services',
    )
    expect(corrected.execution_mode).toBe('planning')
    expect(corrected.response).toBeUndefined()
  })

  it('leaves direct_answer for informational questions', () => {
    const thinking = directAnswerThinking()
    const corrected = correctMisroutedThinking(
      thinking,
      'What is the difference between Agent.stream and streamText?',
    )
    expect(corrected).toEqual(thinking)
  })

  it('does not change agent_call or planning routes', () => {
    expect(
      correctMisroutedThinking(
        {
          execution_mode: 'agent_call',
          goal: 'g',
          task: 't',
          context: [],
        },
        'Fix the bug',
      ).execution_mode,
    ).toBe('agent_call')
  })

  it('upgrades ambiguous direct_answer to agent_call when tools are enabled', () => {
    const corrected = correctMisroutedThinking(
      directAnswerThinking(),
      'What is the best way to refactor the auth module?',
      { toolsEnabled: true },
    )
    expect(corrected.execution_mode).toBe('agent_call')
    expect(corrected.response).toBeUndefined()
  })

  it('keeps direct_answer for pure Q&A even when tools are enabled', () => {
    const thinking = directAnswerThinking({
      response: 'Rust is a systems language.',
    })
    const corrected = correctMisroutedThinking(thinking, 'What is Rust?', {
      toolsEnabled: true,
    })
    expect(corrected).toEqual(thinking)
  })
})

describe('downgradeAgentCallForInlineDiagram', () => {
  it('downgrades agent_call to direct_answer for explain/plot requests', () => {
    const corrected = downgradeAgentCallForInlineDiagram(
      {
        execution_mode: 'agent_call',
        goal: 'Explain sin',
        task: 'Plot sin(x)',
        context: [],
      },
      'Explain sin(x)',
    )
    expect(corrected.execution_mode).toBe('direct_answer')
  })

  it('leaves agent_call for actionable work', () => {
    expect(
      downgradeAgentCallForInlineDiagram(
        {
          execution_mode: 'agent_call',
          goal: 'Fix',
          task: 'Fix test',
          context: [],
        },
        'Fix the failing unit test',
      ).execution_mode,
    ).toBe('agent_call')
  })

  it('does not change planning or direct_answer routes', () => {
    expect(
      downgradeAgentCallForInlineDiagram(
        directAnswerThinking(),
        'Explain sin(x)',
      ).execution_mode,
    ).toBe('direct_answer')
  })
})
