import { describe, expect, it } from 'vitest'
import {
  formatPartialThinkingProgress,
  formatThinkingMarkdown,
  normalizeThinkingOutput,
  parseThinkingJson,
} from './thinking-parse'

describe('normalizeThinkingOutput', () => {
  it('falls back to agent_call when direct_answer has no response', () => {
    expect(
      normalizeThinkingOutput({
        execution_mode: 'direct_answer',
        goal: 'Explain',
        task: 'Answer',
        context: [],
      }).execution_mode,
    ).toBe('agent_call')
  })
})

describe('parseThinkingJson', () => {
  it('preserves planning mode', () => {
    const raw = JSON.stringify({
      execution_mode: 'planning',
      goal: 'Ship the feature',
      task: 'Break work into steps',
      context: ['repo: teralexi'],
    })
    const parsed = parseThinkingJson(raw)
    expect(parsed.execution_mode).toBe('planning')
    expect(parsed.goal).toBe('Ship the feature')
    expect(parsed.context).toEqual(['repo: teralexi'])
  })

  it('parses direct_answer with response', () => {
    const raw = JSON.stringify({
      execution_mode: 'direct_answer',
      goal: 'Explain TypeScript',
      task: 'Answer what generics are',
      context: [],
      response: 'Generics let you write reusable typed components.',
    })
    const parsed = parseThinkingJson(raw)
    expect(parsed.execution_mode).toBe('direct_answer')
    expect(parsed.response).toContain('Generics')
  })

  it('falls back to agent_call when direct_answer has no response', () => {
    const raw = JSON.stringify({
      execution_mode: 'direct_answer',
      goal: 'Explain',
      task: 'Answer',
      context: [],
    })
    expect(parseThinkingJson(raw).execution_mode).toBe('agent_call')
  })

  it('parses research mode JSON', () => {
    const raw = JSON.stringify({
      execution_mode: 'research',
      goal: 'Research otters',
      task: 'river otters habitat',
      context: [],
    })
    expect(parseThinkingJson(raw).execution_mode).toBe('research')
  })


  it('parses skill_chain mode JSON', () => {
    const raw = JSON.stringify({
      execution_mode: 'skill_chain',
      goal: 'Research then write a report',
      task: 'Chain research agent and document agent',
      context: [],
      rationale: 'Two distinct agent capabilities in sequence',
    })
    const parsed = parseThinkingJson(raw)
    expect(parsed.execution_mode).toBe('skill_chain')
    expect(parsed.rationale).toContain('distinct agent')
  })

  it('rejects non-JSON', () => {
    expect(() => parseThinkingJson('## Goal\nHi')).toThrow(/valid JSON/i)
  })
})

describe('formatPartialThinkingProgress', () => {
  it('shows raw tokens until goal/task text exists', () => {
    const partial = '{"execution_mode":"agent_call","goal":"'
    expect(formatPartialThinkingProgress(partial)).toBe(partial)
  })

  it('formats once a non-empty goal is present', () => {
    const partial =
      '{"execution_mode":"agent_call","goal":"Fix the Thinking bubble","task":"Stream live'
    const formatted = formatPartialThinkingProgress(partial)
    expect(formatted).toContain('Mode:')
    expect(formatted).toContain('Fix the Thinking bubble')
    expect(formatted).toContain('Stream live')
  })

  it('falls back to raw text before any JSON object starts', () => {
    expect(formatPartialThinkingProgress('Analyzing')).toBe('Analyzing')
  })
})

describe('formatThinkingMarkdown', () => {
  it('includes mode and sections', () => {
    const md = formatThinkingMarkdown({
      execution_mode: 'agent_call',
      goal: 'G',
      task: 'T',
      context: ['c1'],
    })
    expect(md).toContain('- Mode: Agent call')
    expect(md).toContain('- Goal: G')
    expect(md).toContain('- Task: T')
    expect(md).toContain('- Context')
    expect(md).toContain('- c1')
  })

  it('labels direct answer mode', () => {
    const md = formatThinkingMarkdown({
      execution_mode: 'direct_answer',
      goal: 'G',
      task: 'T',
      context: [],
      response: 'Hello',
    })
    expect(md).toContain('- Mode: Direct answer')
  })
})
