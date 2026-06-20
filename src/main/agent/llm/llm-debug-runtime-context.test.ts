import { describe, expect, it } from 'vitest'
import { serializeAgentRuntimeContext } from './llm-debug-runtime-context'
import type { AgentStepContext } from '../context'

function makeStepCtx(): AgentStepContext {
  const stepOutputs = {}
  const flow = {
    flowId: 'conv:msg',
    currentMessages: [{ role: 'user', content: 'hi' }],
    clientUiMessages: [],
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
    lastHitlPausedStageId: undefined,
    approvalResumeTodoIndex: undefined,
    resumeTodoIndex: undefined,
    pipelineGotoStageId: undefined,
    skillChainPlan: undefined,
    skillChainResults: new Map<string, string>(),
    collectedFormByTodoId: {},
    generatedFormSchemaByTodoId: new Map<number, unknown>(),
    markdownReferenceBodyByKey: new Map<string, string>(),
    stepOutputs,
    stepHistory: [],
    stepContexts: {},
    outputStore: {
      keys: () => ['thinking'],
      all: () => [{ stepId: 'thinking', data: { raw: 'x' } }],
    },
    runtimeTools: [{ name: 'read_file' }],
    executionSteps: { thinking: 'think', toolLoop: { tools: [] } },
    model: { modelId: 'test-model' },
    config: {},
    sandbox: {
      getConversationId: () => 'conv-1',
      getRoot: () => '/tmp/sandbox',
      layout: {
        root: '/tmp/sandbox',
        skillsDir: '/tmp/sandbox/skills',
        refsDir: '/tmp/sandbox/refs',
        scriptsDir: '/tmp/sandbox/scripts',
        outputDir: '/tmp/sandbox/output',
      },
    },
    form: {
      uiMessagesIndicateFormCollectionResume: () => false,
    },
  }

  return {
    stepId: 'thinking',
    title: 'Thinking',
    stepInstanceKey: 'conv:msg::thinking:abcd1234',
    flowStepConfig: undefined,
    opts: {
      provider: 'openai',
      model: 'gpt-test',
      userId: 'default',
      conversationId: 'conv-1',
      agentId: 'skill:coding',
      skillId: 'coding',
      llmDebugRunId: 'run-1',
      responseLanguage: 'English',
      availableSet: ['read_file'],
      availableSetTouched: true,
      mcpTools: [],
    },
    agentFlow: flow,
    agentRun: {
      meta: {
        runId: 'conv:msg',
        depth: 0,
        agentId: 'skill:coding',
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      },
    },
  } as unknown as AgentStepContext
}

describe('serializeAgentRuntimeContext', () => {
  it('captures step, flow, and nested context class fields', () => {
    const snap = serializeAgentRuntimeContext(makeStepCtx())
    expect(snap.classes.AgentStepContext?.className).toBe('AgentStepContext')
    expect(snap.classes.AgentStepContext?.stepId).toBe('thinking')
    expect(snap.classes.AgentFlowContext?.className).toBe('AgentFlowContext')
    expect(snap.classes.AgentFlowContext?.flowId).toBe('conv:msg')
    expect(snap.classes.AgentFlowContext?.currentMessages).toEqual([
      { role: 'user', content: 'hi' },
    ])
    expect(snap.classes.AgentResponseOpts?.skillId).toBe('coding')
    expect(snap.classes.AgentRun?.runId).toBe('conv:msg')
    expect(snap.classes.SandboxContext?.root).toBe('/tmp/sandbox')
    expect(snap.classes.StepOutputStore?.stepIds).toEqual(['thinking'])
    expect(snap.classes.ProviderContext?.resolvedModel).toBe('test-model')
  })
})
