import { describe, expect, it, vi } from 'vitest'
import { AgentFlow } from './agent-flow'
import {
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import { createFlowStageRegistry } from './stage-runners'
import {
  executeFlowPipeline,
  FlowPipelineRegistry,
  type PipelineEntry,
} from './pipeline'
import type { AgentFlowContext } from '../context'

const baseOpts = {
  provider: 'ollama' as const,
  model: 'test',
  systemPrompt: '',
  messages: [],
  userId: 'u1',
}

describe('AgentFlow pipeline (fluent API)', () => {
  it('defaultPipeline() uses conditional branches (toolLoop in else branch)', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.defaultPipeline()
    expect(flow.pipelineStages()).toEqual([])
    expect(
      (flow as unknown as { conditionalBranches: unknown[] }).conditionalBranches
        .length,
    ).toBeGreaterThan(0)
    const ctx = {
      opts: { conversationId: 'conv-1' },
      outputStore: { all: () => [] },
      stepOutputs: {},
    } as AgentFlowContext
    expect(flow.resolvedPipelineStages(ctx)).toContain(TOOL_LOOP_STEP_ID)
  })

  it('fromAgentConfig() applies React pipeline when tools configured', () => {
    const flow = new AgentFlow(
      {
        ...baseOpts,
        executionSteps: {
          skills: 'Run tools',
          toolLoop: { tools: [{ name: 'read_file' } as never] },
        },
      },
      {},
    )
    flow.fromAgentConfig()
    expect(flow.pipelineStages()).toEqual([])
    expect(
      (flow as unknown as { conditionalBranches: unknown[] }).conditionalBranches
        .length,
    ).toBeGreaterThan(0)
  })

  it('fromAgentConfig() falls back to React pipeline when executionSteps empty', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.fromAgentConfig()
    expect(flow.pipelineStages()).toEqual([])
  })

  it('HITL resume reuses fromAgentConfig pipeline', () => {
    const flow = new AgentFlow(
      {
        ...baseOpts,
        executionSteps: {
          toolLoop: { tools: [{ name: 'read_file' } as never] },
        },
      },
      {},
    )
    flow.fromAgentConfig()
    expect(flow.pipelineStages()).toEqual([])
    const ctx = {
      opts: { conversationId: 'conv-1' },
      outputStore: { all: () => [] },
      stepOutputs: {},
    } as AgentFlowContext
    expect(flow.resolvedPipelineStages(ctx)).toContain(TOOL_LOOP_STEP_ID)
  })
})

describe('createFlowStageRegistry', () => {
  it('starts empty; fluent methods attach runners on pipeline entries', () => {
    const registry = createFlowStageRegistry()
    expect(registry.get(THINKING_STEP_ID)).toBeUndefined()
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().thinking()
    const entry = (
      flow as unknown as { pipeline: { runner?: { id: string } }[] }
    ).pipeline[0]
    expect(entry.runner?.id).toBe(THINKING_STEP_ID)
  })
})

describe('executeFlowPipeline with startIndex', () => {
  it('skips stages before startIndex', async () => {
    const ran: string[] = []
    const makeEntry = (id: string): PipelineEntry => ({
      id: id as never,
      runner: {
        id: id as never,
        title: id,
        run: async () => {
          ran.push(id)
        },
      },
    })

    const entries: PipelineEntry[] = [
      makeEntry('stage-a'),
      makeEntry('stage-b'),
      makeEntry('stage-c'),
    ]

    const ctx = {
      buildStructuredAssistantContent: () => 'done',
      consumePipelineGoto: () => undefined,
    } as unknown as AgentFlowContext

    const registry = new FlowPipelineRegistry()

    await executeFlowPipeline({
      ctx,
      linear: entries,
      registry,
      returnIfHitlPaused: () => null,
      startIndex: 1,
    })

    expect(ran).toEqual(['stage-b', 'stage-c'])
  })

  it('runs all stages when startIndex is 0', async () => {
    const ran: string[] = []
    const makeEntry = (id: string): PipelineEntry => ({
      id: id as never,
      runner: {
        id: id as never,
        title: id,
        run: async () => {
          ran.push(id)
        },
      },
    })

    const entries: PipelineEntry[] = [
      makeEntry('stage-a'),
      makeEntry('stage-b'),
    ]

    const ctx = {
      buildStructuredAssistantContent: () => 'done',
      consumePipelineGoto: () => undefined,
    } as unknown as AgentFlowContext

    const registry = new FlowPipelineRegistry()

    await executeFlowPipeline({
      ctx,
      linear: entries,
      registry,
      returnIfHitlPaused: () => null,
      startIndex: 0,
    })

    expect(ran).toEqual(['stage-a', 'stage-b'])
  })

  it('skips stages before startFromStageId', async () => {
    const ran: string[] = []
    const makeEntry = (id: string): PipelineEntry => ({
      id: id as never,
      runner: {
        id: id as never,
        title: id,
        run: async () => {
          ran.push(id)
        },
      },
    })

    const entries: PipelineEntry[] = [
      makeEntry('stage-a'),
      makeEntry('stage-b'),
      makeEntry('stage-c'),
    ]

    const ctx = {
      buildStructuredAssistantContent: () => 'done',
      consumePipelineGoto: () => undefined,
    } as unknown as AgentFlowContext

    const registry = new FlowPipelineRegistry()

    await executeFlowPipeline({
      ctx,
      linear: entries,
      registry,
      returnIfHitlPaused: () => null,
      startFromStageId: 'stage-b',
    })

    expect(ran).toEqual(['stage-b', 'stage-c'])
  })
})
