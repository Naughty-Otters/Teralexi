import type MarkdownIt from 'markdown-it'

import { prepareMarkdownSource } from '@shared/markdown/prepare-markdown-source'
import { AGENTIC_RUN_STEP_TITLE } from '@shared/agent/agentic-run-labels'
import { renderStepDisclosureHtml } from './stepDisclosureRender'
import { renderStepOutputLinksHtml } from './stepOutputLinksRender'
import { parseAssistantStructuredContent } from '@store/agent/context'
import { stepAttachmentsToOutputLinks } from '@shared/agent/step-attachment'
import type {
  AssistantStructuredContent,
  AssistantSubStep,
  StepRunCapture,
} from '@store/agent/types'

type AssistantSubStepType = AssistantSubStep['type']

const BADGE_MAP: Array<[string | RegExp, string, string]> = [
  ['⏳', 'task-badge--pending', 'pending'],
  ['🔄', 'task-badge--running', 'running'],
  ['✅', 'task-badge--done', 'done'],
  ['❌', 'task-badge--failed', 'failed'],
  ['⚠️', 'task-badge--warn', 'warn'],
  ['🔁', 'task-badge--retry', 'retry'],
  ['📋', 'task-badge--task', 'task'],
  ['🎯', 'task-badge--goal', 'goal'],
]

function renderMarkdownBody(
  markdown: MarkdownIt,
  source: string,
): string {
  const prepared = prepareMarkdownSource(source)
  if (!prepared) return ''
  return applyStatusBadges(markdown.render(prepared))
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Thinking stays plain text — never markdown-it. */
function renderThinkingPlainBody(source: string): string {
  const trimmed = source.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return ''
  return `<pre class="conversation-thinking-text">${escapeHtmlText(trimmed)}</pre>`
}

function renderStepBodyHtml(
  markdown: MarkdownIt,
  step: AssistantSubStep,
  stepContent: string,
): string {
  if (step.type === 'ThinkingStep') {
    // Intentionally ignore markdown — thinking is never prepared/rendered as MD.
    void markdown
    return renderThinkingPlainBody(stepContent)
  }
  return renderMarkdownBody(markdown, stepContent)
}

export function applyStatusBadges(html: string): string {
  let out = html
  for (const [token, cls, label] of BADGE_MAP) {
    const pattern =
      typeof token === 'string'
        ? token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : token.source
    out = out.replace(
      new RegExp(pattern, 'g'),
      `<span class="task-badge ${cls}">${label}</span>`,
    )
  }
  return out
}

function renderStepLabel(step: AssistantSubStep): string {
  const customTitle = step.title.trim()
  if (customTitle) return customTitle
  if (step.type === 'ThinkingStep') return 'Thinking'
  if (step.type === 'PlanningStep') return 'Exploring'
  if (step.type === 'SkillsToolExecutionStep') return AGENTIC_RUN_STEP_TITLE
  if (step.type === 'SummaryStep') return 'Summary'
  if (step.type === 'AnalysisStep') return 'Summary'
  if (step.type === 'ReportStep') return 'Report'
  return step.type
}

function splitStreamingTextByStep(
  streamingText: string,
): Partial<Record<AssistantSubStepType, string>> {
  const text = streamingText.trim()
  if (!text) return {}

  const analysisMatch = text.match(
    /(\n\[ANALYSIS[^\n]*\]|\nThe final goal has not been fully achieved:|\nBefore proceeding with task "[^"]+":)/i,
  )
  const analysisStart = analysisMatch?.index ?? -1

  const preAnalysis =
    analysisStart >= 0 ? text.slice(0, analysisStart).trim() : text
  const analysisText =
    analysisStart >= 0 ? text.slice(analysisStart).trim() : ''

  const todoMatch = preAnalysis.match(/\n📋 Task \d+\//)
  const todoStart = todoMatch?.index ?? -1

  let planningText = ''
  let toolText = ''

  if (todoStart >= 0) {
    planningText = preAnalysis.slice(0, todoStart).trim()
    toolText = preAnalysis.slice(todoStart).trim()
  } else if (
    /🎯 Final goal:/i.test(preAnalysis) ||
    /Final goal:/i.test(preAnalysis) ||
    /Todo list:/i.test(preAnalysis)
  ) {
    planningText = preAnalysis
  } else {
    toolText = preAnalysis
  }

  const result: Partial<Record<AssistantSubStepType, string>> = {}
  if (planningText) result.PlanningStep = planningText
  if (toolText) result.SkillsToolExecutionStep = toolText
  if (analysisText) result.SummaryStep = analysisText

  return result
}

function buildLiveStructuredContent(
  streamingText: string,
): AssistantStructuredContent | null {
  const stepTextByType = splitStreamingTextByStep(streamingText)
  const orderedTypes: AssistantSubStepType[] = [
    'ThinkingStep',
    'PlanningStep',
    'SkillsToolExecutionStep',
    'SummaryStep',
    'ReportStep',
  ]

  const subSteps: AssistantSubStep[] = orderedTypes
    .map((type) => {
      const content = stepTextByType[type]?.trim() ?? ''
      if (!content) return null
      return {
        type,
        title: renderStepLabel({ type, title: '', content: '' }),
        content,
      }
    })
    .filter((step): step is AssistantSubStep => step != null)

  if (subSteps.length === 0) return null

  return {
    version: 2,
    assistantContent: {
      outer: { finalResult: '', report: '' },
      subSteps,
    },
  }
}

function renderStepCapturesOutputLinks(
  captures: StepRunCapture[] | undefined,
): string {
  if (!captures?.length) return ''
  const sections = captures
    .filter((capture) => capture.attachments?.length)
    .map((capture) => {
      const linksHtml = renderStepOutputLinksHtml(
        stepAttachmentsToOutputLinks(capture.attachments ?? []),
      )
      return renderStepDisclosureHtml(capture.title, linksHtml, { open: false })
    })
  if (!sections.length) return ''
  return `<section class="assistant-content-step-outputs">${sections.join('')}</section>`
}

function renderStructuredAssistantContent(
  content: AssistantStructuredContent,
  markdown: MarkdownIt,
  options?: { debug?: boolean; isStreaming?: boolean },
): string | null {
  const debug = options?.debug ?? false
  const isStreaming = options?.isStreaming === true

  const reportFromOuter = content.assistantContent.outer.report.trim()
  const reportFromStep =
    content.assistantContent.subSteps
      .find((s) => s.type === 'ReportStep')
      ?.content.trim() ?? ''
  const reportCombined = reportFromOuter || reportFromStep

  /** Non-debug: chat panel shows only the report block for v2 structured payloads. */
  if (!debug) {
    const outputLinksBlock = renderStepCapturesOutputLinks(
      content.assistantContent.outer.stepCaptures,
    )
    if (!reportCombined && !outputLinksBlock) {
      return `<div class="assistant-content-v2 assistant-content-v2--report-only"><section class="assistant-content-block"><div class="assistant-content-body"><p class="assistant-content-placeholder">No report in this result.</p></div></section></div>`
    }
    const reportOnlyBlock = reportCombined
      ? `<section class="assistant-content-block"><div class="assistant-content-body">${renderMarkdownBody(markdown, reportCombined)}</div></section>`
      : ''
    return `<div class="assistant-content-v2 assistant-content-v2--report-only">${reportOnlyBlock}${outputLinksBlock}</div>`
  }

  const streamingText =
    content.assistantContent.outer.streamingText?.trim() ?? ''
  const streamingByStep = splitStreamingTextByStep(streamingText)
  const finalResult = content.assistantContent.outer.finalResult.trim()
  const report = reportFromOuter

  const finalResultBlock = finalResult
    ? renderStepDisclosureHtml(
        'Final Result',
        renderMarkdownBody(markdown, finalResult),
        { open: false },
      )
    : ''

  const reportBlock = report
    ? `<section class="assistant-content-block"><div class="assistant-content-body">${renderMarkdownBody(markdown, report)}</div></section>`
    : ''

  const baseSubSteps = content.assistantContent.subSteps
  const hasSubSteps = baseSubSteps.length > 0
  const stepEntries: AssistantSubStep[] = hasSubSteps
    ? baseSubSteps
    : (
        [
          'ThinkingStep',
          'PlanningStep',
          'SkillsToolExecutionStep',
          'SummaryStep',
          'ReportStep',
        ] as const
      )
        .map((type) => {
          const c = streamingByStep[type]?.trim() ?? ''
          if (!c) return null
          return {
            type,
            title: '',
            content: '',
          } as AssistantSubStep
        })
        .filter((step): step is AssistantSubStep => step != null)

  const activeSubStepType =
    isStreaming && stepEntries.length > 0
      ? stepEntries[stepEntries.length - 1].type
      : null

  const subStepItems = stepEntries
    .map((step) => {
      const stepStreamingText = streamingByStep[step.type]?.trim() ?? ''
      const stepContent = [step.content.trim(), stepStreamingText]
        .filter(Boolean)
        .join('\n\n')
      const isActiveSubStep = activeSubStepType === step.type
      const disclosure = renderStepDisclosureHtml(
        renderStepLabel(step),
        renderStepBodyHtml(markdown, step, stepContent),
        {
          open: isStreaming ? isActiveSubStep : false,
          active: isActiveSubStep,
        },
      )
      return `<li class="assistant-content-step-item">${disclosure}</li>`
    })
    .join('')

  const subStepsBlock = subStepItems
    ? renderStepDisclosureHtml(
        'Execution Steps',
        `<ol class="assistant-content-substeps-list">${subStepItems}</ol>`,
        {
          open: isStreaming,
          active: isStreaming,
        },
      )
    : ''

  if (!finalResultBlock && !reportBlock && !subStepsBlock) return null

  return `<div class="assistant-content-v2">${subStepsBlock}${finalResultBlock}${reportBlock}</div>`
}

const JSON_STRUCTURE_START = /^\s*\{\s*"version"\s*:\s*/

/**
 * Renders assistant message text: v2 JSON {@link AssistantStructuredContent},
 * or (while streaming plain text) heuristic step sections, else Markdown.
 */
export function renderAssistantMessageHtml(
  raw: string,
  markdown: MarkdownIt,
  options?: { isStreaming?: boolean; structuredDebug?: boolean },
): string {
  const structuredDebug = options?.structuredDebug ?? false
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const parsed = parseAssistantStructuredContent(trimmed)
  if (parsed) {
    const html = renderStructuredAssistantContent(parsed, markdown, {
      debug: structuredDebug,
      isStreaming: options?.isStreaming,
    })
    if (html) return html
  }

  /** Live step heuristics only when debug is on; otherwise stream as plain markdown. */
  if (
    structuredDebug &&
    options?.isStreaming &&
    trimmed &&
    !JSON_STRUCTURE_START.test(trimmed)
  ) {
    const live = buildLiveStructuredContent(trimmed)
    if (live) {
      const html = renderStructuredAssistantContent(live, markdown, {
        debug: true,
        isStreaming: true,
      })
      if (html) return html
    }
  }

  const prepared = prepareMarkdownSource(raw)
  if (!prepared) return ''
  return renderMarkdownBody(markdown, prepared)
}
