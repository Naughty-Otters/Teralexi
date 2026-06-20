import { describe, expect, it } from 'vitest'
import { AgentFlowContext } from './context'
import { CREATE_PAPER_STEP_ID, SEARCH_STEP_ID } from './constants/step-ids'
import {
  buildPipelineConversationTurns,
  pipelineSectionIdForStep,
} from './pipeline-conversation-persist'

describe('pipeline-conversation-persist', () => {
  it('maps createPaper to researchReport section', () => {
    expect(pipelineSectionIdForStep(CREATE_PAPER_STEP_ID)).toBe('researchReport')
  })

  it('builds turns from completed step history', () => {
    const ctx = new AgentFlowContext({
      provider: 'ollama',
      model: 'test',
      systemPrompt: '',
      messages: [{ role: 'user', content: 'hi' }],
    })
    const search = ctx.beginStep(SEARCH_STEP_ID, 'Search')
    ctx.recordStepOutput(
      SEARCH_STEP_ID,
      'Search',
      { topic: 'AI', items: [], abstraction: 'sum', rendered: 'search out' },
      'search out',
      undefined,
      search.key,
    )
    const paper = ctx.beginStep(CREATE_PAPER_STEP_ID, 'Research Report')
    ctx.recordStepOutput(
      CREATE_PAPER_STEP_ID,
      'Research Report',
      {
        topic: 'AI',
        abstraction: 'sum',
        sourceCount: 1,
        outputPath: '/tmp/research-report.pdf',
        rendered: 'report ready',
      },
      'report ready',
      { outputPath: '/tmp/research-report.pdf' },
      paper.key,
    )

    const turns = buildPipelineConversationTurns(ctx)
    expect(turns.some((t) => t.sectionId === 'researchReport')).toBe(true)
    expect(turns.some((t) => t.stepId === SEARCH_STEP_ID)).toBe(true)
  })

  it('persists visible tool-loop parent with attachments even when only child completed', () => {
    const ctx = new AgentFlowContext({
      provider: 'ollama',
      model: 'test',
      systemPrompt: '',
      messages: [{ role: 'user', content: 'hi' }],
    })
    const parent = ctx.beginStep('toolLoop', 'Agentic Run')
    const child = ctx.beginStep('toolLoop', 'Agentic Run', {
      suppressToolLoopUi: true,
    })
    ctx.appendStepAttachments(child.key, [
      { path: '/sandbox/output/toolLoop/run/results/out.html', label: 'out.html' },
    ])
    ctx.mergeToolLoopAttachmentsIntoParent(parent.key)
    ctx.stepProgressTextByKey.set(parent.key, 'Tool finished')

    const turns = buildPipelineConversationTurns(ctx)
    const toolTurn = turns.find((t) => t.sectionId === 'SkillsToolExecutionStep')
    expect(toolTurn?.attachments?.map((a) => a.label)).toContain('out.html')
  })
})
