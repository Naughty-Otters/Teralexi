import { describe, expect, it } from 'vitest'
import { AgentFlowContext } from './context'
import { CREATE_PAPER_STEP_ID, THINKING_STEP_ID } from './constants/step-ids'
import { StepOutputStore } from './steps/step-output-store'
import { createFlowStageRegistry } from './flow/stage-runners'
import {
  isAssistantStructuredContent,
  parseAssistantStructuredContent,
} from './utils/structured-content'

describe('buildStructuredAssistantContent (research path)', () => {
  it('includes research report digest and refs when createPaper ran without summary/report', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: THINKING_STEP_ID,
      instanceKey: 'thinking:1',
      data: { raw: 'Research otters', execution_mode: 'research' },
      timestamp: '2026-01-01T00:00:00Z',
    })
    store.push({
      stepId: CREATE_PAPER_STEP_ID,
      instanceKey: 'createPaper:1',
      data: {
        topic: 'River otters',
        abstraction: 'Otters live in rivers.',
        sourceCount: 3,
        outputPath: '/sandbox/createPaper/output/research-report.pdf',
        rendered: '# Research report: River otters\n\nFindings here.',
        text: '# Research report: River otters\n\nFindings here.',
      },
      timestamp: '2026-01-01T00:00:02Z',
    })

    const ctx = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [],
        userId: 'u1',
      },
      {},
    )
    ctx.outputStore = store
    ctx.pipelineRegistry = createFlowStageRegistry()

    const raw = ctx.buildStructuredAssistantContent()
    const parsed = parseAssistantStructuredContent(raw)
    expect(parsed).not.toBeNull()
    expect(isAssistantStructuredContent(parsed)).toBe(true)

    const outer = parsed!.assistantContent.outer
    expect(outer.finalResult).toContain('Research report: River otters')
    expect(outer.finalResult).toContain('Findings here')
    expect(outer.report).toBe('')
    expect(outer.researchReport?.pdfPath).toContain('research-report.pdf')
    expect(outer.researchReport?.topic).toBe('River otters')
    expect(outer.researchReport?.sourceCount).toBe(3)
  })
})
