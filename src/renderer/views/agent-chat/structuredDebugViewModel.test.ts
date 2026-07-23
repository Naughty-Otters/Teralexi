import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { extractPersistedStepBodies } from '@shared/persistence/conversation-storage-contract'
import {
  limitMessageContentForPersistence,
  limitPersistedStepText,
} from '@shared/persistence/limit-persisted-content'
import {
  buildStructuredDebugViewForMessage,
  buildStructuredDebugViewFromStepProgress,
  filterConversationBubbleSections,
} from './structuredDebugViewModel'
import { HEAD_TAIL_KEEP_CHARS } from '@shared/text/truncate-head-tail'

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })

describe('buildStructuredDebugViewFromStepProgress', () => {
  it('uses semantic section ids for live step-progress bubbles', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'thinking-live-1',
          data: {
            stepId: 'thinking',
            title: 'Thinking',
            sequence: 1,
            status: 'running',
            content: 'Analyzing the task',
          },
        },
      ],
      markdown,
      { isStreaming: true },
    )

    expect(view?.sections[0]?.id).toBe('ThinkingStep')
  })

  it('renders thinking step bodies as plain pre (JSON-safe, not markdown)', () => {
    const head = 'H'.repeat(HEAD_TAIL_KEEP_CHARS)
    const tail = 'LIVE_TAIL'
    const content = limitPersistedStepText(
      `${head}${'A'.repeat(HEAD_TAIL_KEEP_CHARS + 500)}${tail}`,
    )
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'thinking-live-1',
          data: {
            stepId: 'thinking',
            title: 'Thinking',
            sequence: 1,
            status: 'running',
            content,
          },
        },
      ],
      markdown,
      { isStreaming: true },
    )

    const html = view?.sections[0]?.bodyHtml ?? ''
    expect(html).toContain('conversation-thinking-text')
    expect(html).toContain('<pre')
    expect(html).toContain('....')
    expect(html).toContain('LIVE_TAIL')
  })

  it('does not let markdown eat underscores in streamed thinking JSON', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'thinking-live-1',
          data: {
            stepId: 'thinking',
            title: 'Thinking',
            sequence: 1,
            status: 'running',
            content:
              '{"execution_mode":"agent_call","goal":"The user wants a fix","rationale":"The bubble must show full lines"}',
          },
        },
      ],
      markdown,
      { isStreaming: true },
    )

    const html = view?.sections[0]?.bodyHtml ?? ''
    expect(html).toContain('conversation-thinking-text')
    expect(html).toContain('execution_mode')
    expect(html).toContain('The user wants a fix')
    expect(html).toContain('The bubble must show full lines')
    expect(html).not.toContain('<em>')
  })

  it('renders markdown inside outer prose fences as html, not a code block', () => {
    const inner = '### Inbox\n\n| From | Subject |\n|---|---|\n| A | B |'
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'summary-1',
          data: {
            stepId: 'summary',
            title: 'Summary',
            sequence: 1,
            status: 'completed',
            content: `\`\`\`markdown\n${inner}\n\`\`\``,
          },
        },
      ],
      markdown,
    )

    const html = view?.sections[0]?.bodyHtml ?? ''
    expect(html).toContain('<h3>')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<pre>')
    expect(html).not.toContain('###')
  })

  it('renders same-line ```### fences from summary steps', () => {
    const inner =
      "### 📬 Today's New Emails (7 unread)\n\n| # | Time | From |\n|---|---|---|\n| 1 | 3:38 PM | GitHub |"
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'summary-2',
          data: {
            stepId: 'summary',
            title: 'Summary',
            sequence: 1,
            status: 'completed',
            content: `\`\`\`${inner}\n\`\`\``,
          },
        },
      ],
      markdown,
    )

    const html = view?.sections[0]?.bodyHtml ?? ''
    expect(html).toContain('<h3>')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<pre>')
  })

  it('renders fenced summary bodies after backend-style truncation while streaming', () => {
    const head = '### Header\n\n| A | B |\n|---|---|\n'
    const tail = '| 99 | done |'
    const middle = 'x'.repeat(HEAD_TAIL_KEEP_CHARS + 500)
    const content = limitPersistedStepText(
      `\`\`\`markdown\n${head}${middle}${tail}\n\`\`\``,
    )
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'summary-stream',
          data: {
            stepId: 'summary',
            title: 'Summary',
            sequence: 1,
            status: 'running',
            content,
          },
        },
      ],
      markdown,
      { isStreaming: true },
    )

    const html = view?.sections[0]?.bodyHtml ?? ''
    expect(html).toContain('<h3>')
    expect(html).not.toContain('<pre>')
    expect(html).not.toContain('```')
  })

  it('marks superseded steps done when a later step has higher sequence', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'foreach-1',
          data: {
            stepId: 'foreachItem',
            title: 'Executing',
            sequence: 3,
            status: 'running',
            content: 'Task batch done',
          },
        },
        {
          id: 'toolLoop-2',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 4,
            status: 'running',
            content: 'Tools finished',
          },
        },
        {
          id: 'summary-5',
          data: {
            stepId: 'summary',
            title: 'Summary',
            sequence: 5,
            status: 'completed',
            content: 'All good',
          },
        },
      ],
      markdown,
      { isStreaming: false },
    )

    expect(view?.sections.map((s) => s.status)).toEqual([
      'done',
      'done',
      'done',
    ])
  })

  it('marks the last step done when streaming ended and it has content', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'toolLoop-9',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 9,
            status: 'running',
            content: 'Final tool output',
          },
        },
      ],
      markdown,
      { isStreaming: false },
    )

    expect(view?.sections[0]?.status).toBe('done')
  })

  it('adds a separate attachments bubble when step progress includes files', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'toolLoop-1',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 2,
            status: 'completed',
            content: 'Wrote output files',
            attachments: [
              {
                path: '/sandbox/output/report.html',
                label: 'report.html',
                url: 'file:///sandbox/output/report.html',
                toolName: 'write_file',
              },
            ],
          },
        },
      ],
      markdown,
      { isStreaming: false },
    )

    expect(view?.sections.map((s) => s.id)).toEqual([
      'SkillsToolExecutionStep',
      'SkillsToolExecutionStep::attachments',
    ])
    const main = view?.sections.find((s) => s.id === 'SkillsToolExecutionStep')
    expect(main?.bodyHtml).toContain('Wrote output files')
    const files = view?.sections.find(
      (s) => s.id === 'SkillsToolExecutionStep::attachments',
    )
    expect(files?.sectionKind).toBe('attachments')
    expect(files?.attachments?.[0]?.label).toBe('report.html')
  })

  it('keeps the active step running while the message is still streaming', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'planning-1',
          data: {
            stepId: 'planning',
            title: 'Planning',
            sequence: 1,
            status: 'completed',
            content: 'Plan ready',
          },
        },
        {
          id: 'toolLoop-2',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 2,
            status: 'running',
            content: 'Working…',
          },
        },
      ],
      markdown,
      { isStreaming: true },
    )

    expect(view?.sections.map((s) => s.status)).toEqual(['done', 'running'])
  })
})

describe('buildStructuredDebugViewForMessage pipeline conversation', () => {
  it('restores step bubbles from outer.pipelineConversation after reload', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          pipelineConversation: [
            {
              sectionId: 'ThinkingStep',
              stepId: 'thinking',
              title: 'Thinking',
              content: 'Analyze topic',
              status: 'completed',
            },
            {
              sectionId: 'researchReport',
              stepId: 'createPaper',
              title: 'Research Report',
              content:
                '# Research report: AI\n\n## Report\n\n## Abstract\n\nFull text here.',
              status: 'completed',
              outputLinks: [
                {
                  label: 'research-report.pdf',
                  url: 'file:///tmp/research-report.pdf',
                },
              ],
            },
          ],
        },
        subSteps: [],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    expect(view?.sections.map((s) => s.id)).toEqual([
      'ThinkingStep',
      'researchReport',
      'researchReport::attachments',
    ])
    expect(
      view?.sections.find((s) => s.id === 'researchReport::attachments')
        ?.previewFileUrl,
    ).toContain('research-report.pdf')
  })

  it('includes stepCaptures attachments when pipelineConversation is present', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          pipelineConversation: [
            {
              sectionId: 'ThinkingStep',
              stepId: 'thinking',
              title: 'Thinking',
              content: 'Analyze topic',
              status: 'completed',
            },
          ],
          stepCaptures: [
            {
              stepType: 'SkillsToolExecutionStep',
              title: 'Agentic Run',
              content: 'Created report.html',
              outputPaths: [],
              attachments: [
                {
                  path: '/sandbox/output/toolLoop/run/results/report.html',
                  label: 'report.html',
                  url: 'file:///sandbox/output/toolLoop/run/results/report.html',
                },
              ],
            },
          ],
        },
        subSteps: [],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    expect(
      view?.sections.some((s) => s.id === 'SkillsToolExecutionStep::attachments'),
    ).toBe(true)
  })
})

describe('buildStructuredDebugViewForMessage research report', () => {
  it('adds a dedicated Research Report bubble with PDF preview', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          researchReport: {
            pdfPath: '/sandbox/createPaper/output/research-report.pdf',
            pdfUrl: 'file:///sandbox/createPaper/output/research-report.pdf',
            topic: 'AI safety',
            sourceCount: 3,
          },
        },
        subSteps: [],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    const report = view?.sections.find((s) => s.id === 'researchReport')
    expect(report?.title).toBe('Research Report')
    const files = view?.sections.find(
      (s) => s.id === 'researchReport::attachments',
    )
    expect(files?.sectionKind).toBe('attachments')
    expect(files?.previewFileUrl).toContain('research-report.pdf')
    expect(report?.bodyHtml).toContain('Research report')
  })
})

describe('buildStructuredDebugViewForMessage result snapshot', () => {
  it('adds a separate Result snapshot section when outer.resultSnapshot is set', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'All done',
          report: '',
          resultSnapshot: {
            pdfPath: '/sandbox/output/results/result-snapshot.pdf',
            pdfUrl: 'file:///sandbox/output/results/result-snapshot.pdf',
          },
        },
        subSteps: [{ type: 'SummaryStep', title: 'Summary', content: 'ok' }],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    const files = view?.sections.find((s) => s.id === 'resultSnapshot::attachments')
    expect(files?.sectionKind).toBe('attachments')
    expect(files?.title).toContain('result-snapshot.pdf')
    expect(files?.previewFileUrl).toContain('result-snapshot.pdf')
  })

  it('appends result snapshot when step progress is the primary view', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'All done',
          report: '',
          resultSnapshot: {
            pdfPath: '/sandbox/output/results/result-snapshot.pdf',
            pdfUrl: 'file:///sandbox/output/results/result-snapshot.pdf',
          },
        },
        subSteps: [],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [
        {
          id: 'summary-1',
          data: {
            stepId: 'summary',
            title: 'Summary',
            sequence: 1,
            status: 'completed',
            content: 'ok',
          },
        },
      ],
      markdown,
      isStreaming: false,
    })
    expect(
      view?.sections.some((s) => s.id === 'resultSnapshot::attachments'),
    ).toBe(true)
    expect(view?.sections.some((s) => s.title === 'Summary')).toBe(true)
  })
})

describe('filterConversationBubbleSections', () => {
  it('removes final result and report deliverable sections from chat bubbles', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'All done',
          report: '# Final report\n\nDetails here.',
        },
        subSteps: [{ type: 'SummaryStep', title: 'Summary', content: 'ok' }],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    expect(view?.sections.some((s) => s.id === 'finalResult')).toBe(true)
    expect(view?.sections.some((s) => s.id === 'report')).toBe(true)

    const bubbles = filterConversationBubbleSections(view?.sections ?? [])
    expect(bubbles.some((s) => s.id === 'finalResult')).toBe(false)
    expect(bubbles.some((s) => s.id === 'report')).toBe(false)
    expect(bubbles.some((s) => s.id === 'SummaryStep')).toBe(true)
  })

  it('removes report step progress and its attachment bubble from chat', () => {
    const view = buildStructuredDebugViewFromStepProgress(
      [
        {
          id: 'report-1',
          data: {
            stepId: 'report',
            title: 'Report',
            sequence: 6,
            status: 'completed',
            content: '# Report body',
            attachments: [
              {
                path: 'output/results/report.html',
                label: 'report.html',
                url: 'file:///sandbox/output/results/report.html',
              },
            ],
          },
        },
      ],
      markdown,
    )
    const bubbles = filterConversationBubbleSections(view?.sections ?? [])
    expect(bubbles.some((s) => s.id === 'ReportStep')).toBe(false)
    expect(bubbles.some((s) => s.id === 'ReportStep::attachments')).toBe(false)
  })

  it('keeps research and result snapshot attachment bubbles', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          resultSnapshot: {
            pdfPath: '/sandbox/output/results/result-snapshot.pdf',
            pdfUrl: 'file:///sandbox/output/results/result-snapshot.pdf',
          },
        },
        subSteps: [],
      },
    })
    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    const bubbles = filterConversationBubbleSections(view?.sections ?? [])
    expect(bubbles.some((s) => s.id === 'resultSnapshot::attachments')).toBe(
      true,
    )
    expect(bubbles.some((s) => s.id === 'finalResult')).toBe(false)
  })
})

describe('storage vs UI presentation', () => {
  it('shows tool-loop narrative in the bubble while persisted JSON keeps the same text', () => {
    const toolBody = '📋 Task 1/1\n\ngrep -r pattern src/\n\nWrote output files'
    const raw = limitMessageContentForPersistence(
      JSON.stringify({
        version: 2,
        assistantContent: {
          outer: {
            finalResult: '',
            report: '',
            pipelineConversation: [
              {
                sectionId: 'SkillsToolExecutionStep',
                stepId: 'toolLoop',
                title: 'Agentic Run',
                content: toolBody,
                status: 'completed',
              },
            ],
          },
          subSteps: [
            {
              type: 'SkillsToolExecutionStep',
              title: 'Agentic Run',
              content: toolBody,
            },
          ],
        },
      }),
      'assistant',
    )

    const view = buildStructuredDebugViewForMessage({
      raw,
      stepProgressParts: [],
      markdown,
    })
    const main = view?.sections.find((s) => s.id === 'SkillsToolExecutionStep')
    expect(main?.bodyHtml).toContain('grep -r pattern src/')

    const storedBodies = extractPersistedStepBodies(raw)
    expect(storedBodies.some((b) => b.includes('grep -r pattern src/'))).toBe(
      true,
    )
    expect(storedBodies.some((b) => b.includes('Wrote output files'))).toBe(
      true,
    )
  })
})
