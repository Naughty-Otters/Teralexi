import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadEngineAgents = vi.fn()

vi.mock('../config/context', () => ({
  ConfigContext: {
    loadEngineAgents: (...args: unknown[]) => loadEngineAgents(...args),
  },
}))

vi.mock('../utils/agent-run-context', () => ({
  loadAgentRunCredentials: () => ({}),
  loadMcpToolsForAgent: vi.fn(async () => []),
  resolveEnabledSkillToolNames: () => undefined,
}))

vi.mock('../workspace/conversation-workspace', () => ({
  getWorkspacePath: vi.fn(() => '/tmp/test-workspace'),
}))

import {
  buildChildAgentResponseOpts,
  buildContextEnvelope,
  formatSubFlowStepTitle,
  mergeSubFlowOutputText,
  resolveCatalogAgentId,
  resolveChildAgentLlmConfig,
  resolveEngineAgent,
} from './resolve-child-agent'
import type { AgentFlowContext } from '../context'

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
    expect(mergeSubFlowOutputText({ toolLoop: 'Loop only' }, 'summary')).toBe('Loop only')
    expect(mergeSubFlowOutputText({ report: 'Report only' }, 'summary')).toBe('Report only')
  })
})

describe('resolveEngineAgent', () => {
  beforeEach(() => {
    loadEngineAgents.mockReset()
  })

  it('returns agent when found and allowAsSubAgent is not false', async () => {
    loadEngineAgents.mockResolvedValue([
      { id: 'skill:documents', name: 'Documents', allowAsSubAgent: true },
    ])
    const agent = await resolveEngineAgent('user-1', 'skill:documents')
    expect(agent.id).toBe('skill:documents')
  })

  it('resolves short skill ids like coding → skill:coding', async () => {
    loadEngineAgents.mockResolvedValue([
      {
        id: 'skill:coding',
        name: 'Coding',
        allowAsSubAgent: true,
        provider: 'ollama',
        model: 'gemma4',
      },
    ])
    const agent = await resolveEngineAgent('user-1', 'coding')
    expect(agent.id).toBe('skill:coding')
  })

  it('throws when agent is not in catalog', async () => {
    loadEngineAgents.mockResolvedValue([])
    await expect(resolveEngineAgent('user-1', 'skill:missing')).rejects.toThrow(
      /Sub-agent not found/,
    )
  })

  it('throws when allowAsSubAgent is false', async () => {
    loadEngineAgents.mockResolvedValue([
      { id: 'skill:private', name: 'Private', allowAsSubAgent: false },
    ])
    await expect(resolveEngineAgent('user-1', 'skill:private')).rejects.toThrow(
      /not allowed as a sub-agent/,
    )
  })
})

describe('resolveCatalogAgentId', () => {
  const agents = [
    { id: 'skill:default', name: 'Default', skillId: 'default' },
    { id: 'skill:coding', name: 'Coding', skillId: 'coding' },
  ] as never[]

  it('maps bare skill id to catalog id', () => {
    expect(resolveCatalogAgentId(agents, 'coding')).toBe('skill:coding')
    expect(resolveCatalogAgentId(agents, 'skill:coding')).toBe('skill:coding')
  })
})

describe('buildChildAgentResponseOpts', () => {
  beforeEach(() => {
    loadEngineAgents.mockReset()
  })

  it('uses the sub-agent catalog provider/model, not the parent run', async () => {
    loadEngineAgents.mockResolvedValue([
      {
        id: 'skill:default',
        name: 'Default',
        provider: 'openai',
        model: 'gpt-4.1',
        allowAsSubAgent: true,
        systemPrompt: 'parent',
        stageLlmSettings: {
          mode: 'unified',
          default: { provider: 'openai', model: 'gpt-4.1' },
        },
      },
      {
        id: 'skill:coding',
        name: 'Coding',
        skillId: 'coding',
        provider: 'ollama',
        model: 'gemma4',
        allowAsSubAgent: true,
        systemPrompt: 'child coding prompt',
        stageLlmSettings: {
          mode: 'unified',
          default: { provider: 'ollama', model: 'gemma4' },
        },
        toolNeedsApprovalOverrides: {},
      },
    ])

    const parentOnChunk = vi.fn()
    const { opts, agent } = await buildChildAgentResponseOpts({
      agentId: 'coding',
      parentOpts: {
        provider: 'openai',
        model: 'gpt-4.1',
        stageLlm: {
          mode: 'unified',
          default: { provider: 'openai', model: 'gpt-4.1' },
        },
        systemPrompt: 'parent',
        messages: [],
        userId: 'user-1',
        conversationId: 'conv-1',
        onChunk: parentOnChunk,
      },
      task: 'Implement feature X',
      parentCurrentMessages: [{ role: 'user', content: 'parent thread' }],
    })

    expect(agent.id).toBe('skill:coding')
    expect(opts.provider).toBe('ollama')
    expect(opts.model).toBe('gemma4')
    expect(opts.stageLlm?.default).toEqual({
      provider: 'ollama',
      model: 'gemma4',
    })
    expect(opts.systemPrompt).toBe('child coding prompt')
    expect(opts.agentId).toBe('skill:coding')
    expect(opts.skillId).toBe('coding')
    expect(opts.onChunk).toBeUndefined()
    expect(opts.messages.at(-1)?.content).toContain('Implement feature X')
  })

  it('assigns a sub-agent llm debug run id derived from the parent session', async () => {
    loadEngineAgents.mockResolvedValue([
      {
        id: 'skill:coding',
        name: 'Coding',
        skillId: 'coding',
        provider: 'ollama',
        model: 'gemma4',
        allowAsSubAgent: true,
        systemPrompt: 'child',
        toolNeedsApprovalOverrides: {},
      },
    ])

    const { opts } = await buildChildAgentResponseOpts({
      agentId: 'coding',
      parentOpts: {
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'parent',
        messages: [],
        userId: 'user-1',
        conversationId: 'conv-1',
        llmDebugRunId: '2026-06-06T12-00-00-000Z-abcd',
      },
      task: 'Debug task',
    })

    expect(opts.llmDebugRunId).toMatch(
      /^2026-06-06T12-00-00-000Z-abcd__sub__coding__[a-z0-9]{4}$/,
    )
  })

  it('seeds sub-agent messages from parent pipeline envelope when parentContext is set', async () => {
    loadEngineAgents.mockResolvedValue([
      {
        id: 'skill:coding',
        name: 'Coding',
        skillId: 'coding',
        provider: 'ollama',
        model: 'gemma4',
        allowAsSubAgent: true,
        systemPrompt: 'child',
        toolNeedsApprovalOverrides: {},
      },
    ])

    const parentContext = {
      opts: {
        userId: 'user-1',
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      },
      currentMessages: [{ role: 'user', content: 'Parent thread message' }],
      buildPipelineContextMessages: vi.fn(() => [
        { role: 'user', content: 'Planning summary from parent' },
      ]),
    } as unknown as AgentFlowContext

    const { opts } = await buildChildAgentResponseOpts({
      agentId: 'coding',
      parentOpts: parentContext.opts as never,
      parentContext,
      parentRunId: 'conv-1:msg-1',
      rootRunId: 'conv-1:msg-1',
      task: 'Delegated sub-task',
    })

    expect(opts.messages.some((m) => m.content === 'Planning summary from parent')).toBe(
      true,
    )
    expect(opts.messages.some((m) => m.content === 'Parent thread message')).toBe(
      true,
    )
    expect(opts.messages.some((m) => m.content.includes('/tmp/test-workspace'))).toBe(
      true,
    )
    expect(opts.messages.at(-1)?.content).toBe('Delegated sub-task')

    const envelope = buildContextEnvelope(parentContext, {
      parentRunId: 'conv-1:msg-1',
      rootRunId: 'conv-1:msg-1',
      task: 'Delegated sub-task',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
    })
    expect(envelope.pipelineMessages).toHaveLength(1)
    expect(envelope.delegationTask).toBe('Delegated sub-task')
  })
})

describe('resolveChildAgentLlmConfig', () => {
  it('falls back to unified routing from agent provider when stage settings missing', () => {
    const cfg = resolveChildAgentLlmConfig({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
    } as never)
    expect(cfg.provider).toBe('anthropic')
    expect(cfg.model).toBe('claude-sonnet-4')
    expect(cfg.stageLlm.default).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
    })
  })
})

describe('formatSubFlowStepTitle', () => {
  it('uses agent name when present', () => {
    expect(
      formatSubFlowStepTitle({
        id: 'skill:child',
        name: 'Researcher',
      } as never),
    ).toBe('Sub-agent: Researcher')
    expect(
      formatSubFlowStepTitle({
        id: 'skill:child',
        name: '  ',
      } as never),
    ).toBe('Sub-agent: skill:child')
  })
})
