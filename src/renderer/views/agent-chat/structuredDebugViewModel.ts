/**
 * UI presentation layer for assistant structured content.
 *
 * Builds bubble sections, HTML bodies, and tool-loop panel anchors from stored
 * assistant JSON and live step-progress parts. Display rules here must never
 * write back to server storage — see `@shared/persistence/conversation-storage-contract`.
 */
import type MarkdownIt from 'markdown-it'

import { prepareMarkdownSource } from '@shared/markdown/prepare-markdown-source'
import { AGENTIC_RUN_STEP_TITLE } from '@shared/agent/agentic-run-labels'
import {
  attachmentsFromOutputLinks,
  dedupeStepAttachments,
  pdfPreviewUrlFromAttachments,
  stepAttachmentsToOutputLinks,
  type StepAttachment,
} from '@shared/agent/step-attachment'
import { parseAssistantStructuredContent } from '@store/agent/context'
import type {
  AssistantStructuredContent,
  AssistantSubStep,
  AssistantSubStepType,
} from '@store/agent/types'
import { applyStatusBadges } from './assistantStructuredRender'
import {
  isAgentErrorText,
  isLlmErrorProgressText,
} from '@shared/agent/llm-error-ui'
import type { StepOutputLinkView } from './stepOutputLinksRender'
import {
  agentStepProgressStepId,
  isPerTaskForeachItemProgress,
  isPerTaskToolLoopProgress,
  isStaleEmptyToolLoopShell,
  stepProgressPartKey,
  stepProgressSequence,
  type AgentStepProgressData,
} from './stepProgressDisplay'

const JSON_STRUCTURE_START = /^\s*\{\s*"version"\s*:\s*/

export type StructuredDebugSectionStatus = 'running' | 'done'

export type StructuredDebugSectionKind = 'content' | 'attachments'

export type StructuredDebugSection = {
  id: string
  title: string
  bodyHtml: string
  status: StructuredDebugSectionStatus
  sectionKind?: StructuredDebugSectionKind
  attachments?: StepAttachment[]
  parentSectionId?: string
  /** Primary preview URL for attachment bubbles (derived from attachments). */
  previewFileUrl?: string
  runId?: string
  parentRunId?: string
  /** Stable step-progress part id for tool-loop panel anchoring. */
  progressPartKey?: string
}

/** Final report / deliverable sections — shown in the results panel, not as chat bubbles. */
export const REPORT_DELIVERABLE_SECTION_IDS = new Set([
  'finalResult',
  'report',
  'ReportStep',
])

export function isReportDeliverableConversationSection(
  section: Pick<StructuredDebugSection, 'id' | 'sectionKind' | 'parentSectionId'>,
): boolean {
  if (section.sectionKind === 'attachments') {
    const parentId = section.parentSectionId?.trim()
    if (parentId && REPORT_DELIVERABLE_SECTION_IDS.has(parentId)) return true
    for (const deliverableId of REPORT_DELIVERABLE_SECTION_IDS) {
      if (section.id.startsWith(`${deliverableId}::`)) return true
    }
    return false
  }
  return REPORT_DELIVERABLE_SECTION_IDS.has(section.id)
}

/** Conversation bubbles only — omits final report blocks (still in structured data / results panel). */
export function filterConversationBubbleSections<
  T extends StructuredDebugSection,
>(sections: readonly T[]): T[] {
  return sections.filter((section) => !isReportDeliverableConversationSection(section))
}

export function attachmentSectionId(parentSectionId: string): string {
  return `${parentSectionId}::attachments`
}

function sectionHasVisibleBody(section: StructuredDebugSection): boolean {
  return (
    section.bodyHtml.trim().length > 0 ||
    section.status === 'running' ||
    Boolean(section.previewFileUrl?.trim())
  )
}

function normalizeSectionAttachments(
  attachments?: StepAttachment[],
  /** @deprecated Legacy persisted outputLinks only — converted once on load. */
  legacyOutputLinks?: StepOutputLinkView[],
  legacyPreviewUrl?: string,
): StepAttachment[] {
  let merged = attachments?.length ? dedupeStepAttachments(attachments) : []
  if (legacyOutputLinks?.length) {
    merged = dedupeStepAttachments([
      ...merged,
      ...attachmentsFromOutputLinks(legacyOutputLinks),
    ])
  }
  const pdf = legacyPreviewUrl?.trim()
  if (pdf && !pdfPreviewUrlFromAttachments(merged)) {
    merged = dedupeStepAttachments([
      ...merged,
      ...attachmentsFromOutputLinks([
        {
          label: pdf.split('/').pop()?.split('?')[0] || 'Output file',
          url: pdf,
        },
      ]),
    ])
  }
  return merged
}

function buildAttachmentsSection(
  parent: Pick<StructuredDebugSection, 'id' | 'title' | 'status'>,
  attachments: readonly StepAttachment[],
): StructuredDebugSection | null {
  const uniqueAttachments = dedupeStepAttachments(attachments)
  if (!uniqueAttachments.length) return null
  const links = stepAttachmentsToOutputLinks(uniqueAttachments)
  const count = links.length
  const primary =
    pdfPreviewUrlFromAttachments(uniqueAttachments) ?? links[0]?.url?.trim()
  const firstLabel = links[0]?.label?.trim() || 'File'
  const title =
    count <= 1
      ? `File · ${firstLabel}`
      : `Files (${count}) · ${parent.title}`
  return {
    id: attachmentSectionId(parent.id),
    sectionKind: 'attachments',
    parentSectionId: parent.id,
    title,
    bodyHtml: '',
    status: parent.status,
    attachments: uniqueAttachments,
    previewFileUrl: primary,
  }
}

/** Split file outputs into dedicated attachment bubbles after each step section. */
export function postProcessConversationSections(
  sections: readonly StructuredDebugSection[],
): StructuredDebugSection[] {
  const result: StructuredDebugSection[] = []

  for (const section of sections) {
    if (section.sectionKind === 'attachments') {
      const attachments = normalizeSectionAttachments(section.attachments)
      if (attachments.length > 0) {
        const rebuilt = buildAttachmentsSection(
          {
            id: section.parentSectionId ?? section.id.replace(/::attachments$/, ''),
            title: section.title,
            status: section.status,
          },
          attachments,
        )
        if (rebuilt) result.push(rebuilt)
      }
      continue
    }

    const attachments = normalizeSectionAttachments(
      section.attachments,
      undefined,
      section.previewFileUrl,
    )

    const contentSection: StructuredDebugSection = {
      ...section,
      sectionKind: 'content',
      attachments: undefined,
      previewFileUrl:
        attachments.length > 0
          ? undefined
          : section.previewFileUrl,
    }
    result.push(contentSection)

    if (attachments.length > 0) {
      const attachId = attachmentSectionId(contentSection.id)
      if (!result.some((s) => s.id === attachId)) {
        const attachSection = buildAttachmentsSection(
          contentSection,
          attachments,
        )
        if (attachSection) result.push(attachSection)
      }
    }
  }

  return result.filter(
    (s) =>
      s.sectionKind === 'attachments' ||
      sectionHasVisibleBody(s) ||
      Boolean(s.attachments?.length),
  )
}

function buildAttachmentSectionsFromStepCaptures(
  content: AssistantStructuredContent,
): StructuredDebugSection[] {
  const captures = content.assistantContent.outer.stepCaptures
  if (!captures?.length) return []

  const existing = new Set<string>()
  const out: StructuredDebugSection[] = []

  for (const capture of captures) {
    const parentId = capture.stepType
    if (existing.has(parentId)) continue
    const attachments = normalizeSectionAttachments(
      capture.attachments,
      capture.outputLinks,
    )
    if (!attachments.length) continue
    existing.add(parentId)
    const attachSection = buildAttachmentsSection(
      {
        id: parentId,
        title: capture.title?.trim() || capture.stepType,
        status: 'done',
      },
      attachments,
    )
    if (attachSection) out.push(attachSection)
  }
  return out
}

export type StructuredDebugView = {
  sections: StructuredDebugSection[]
}

export type StepProgressPartInput = {
  id?: string
  data?: AgentStepProgressData & {
    attachments?: StepAttachment[]
    /** @deprecated Read only for older persisted messages. */
    outputLinks?: StepOutputLinkView[]
  }
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
  if (step.type === 'CreatePaperStep') return 'Research Report'
  return step.type
}

function stepIdToSectionId(stepId: string): string {
  if (stepId === 'toolLoop' || stepId === 'foreachItem')
    return 'SkillsToolExecutionStep'
  if (stepId === 'createPaper') return 'CreatePaperStep'
  if (stepId === 'thinking') return 'ThinkingStep'
  if (stepId === 'planning') return 'PlanningStep'
  if (stepId === 'summary') return 'SummaryStep'
  if (stepId === 'report') return 'ReportStep'
  return stepId
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

function bodyHtmlFromMarkdown(
  markdown: MarkdownIt,
  text: string,
): string {
  const prepared = prepareMarkdownSource(text)
  if (!prepared) return ''
  return applyStatusBadges(markdown.render(prepared))
}

function buildSectionsFromPipelineConversation(
  turns: NonNullable<
    AssistantStructuredContent['assistantContent']['outer']['pipelineConversation']
  >,
  markdown: MarkdownIt,
): StructuredDebugSection[] {
  const seen = new Set<string>()
  const sections: StructuredDebugSection[] = []
  for (const turn of turns) {
    const sectionId = turn.sectionId?.trim() || turn.stepId
    if (seen.has(sectionId)) continue
    seen.add(sectionId)
    const attachments = normalizeSectionAttachments(
      turn.attachments,
      turn.outputLinks,
    )
    sections.push({
      id: sectionId,
      title: turn.title?.trim() || 'Step',
      bodyHtml: bodyHtmlFromMarkdown(markdown, turn.content ?? ''),
      status: 'done',
      ...(attachments.length ? { attachments } : {}),
    })
  }
  return sections
}

function buildResearchReportSection(
  report: {
    pdfUrl: string
    pdfPath: string
    topic: string
    sourceCount: number
    paperExcerpt?: string
  },
  markdown: MarkdownIt,
): StructuredDebugSection {
  const pdfUrl = report.pdfUrl.trim()
  const label = pdfUrl.split('/').pop()?.split('?')[0] || 'research-report.pdf'
  const excerpt = report.paperExcerpt?.trim()
  const body = excerpt
    ? excerpt
    : [
        `# Research report: ${report.topic || '(topic)'}`,
        '',
        `**Sources reviewed:** ${report.sourceCount}`,
        '',
        '_Open the PDF below for the full report._',
      ].join('\n')
  return {
    id: 'researchReport',
    title: 'Research Report',
    bodyHtml: bodyHtmlFromMarkdown(markdown, body),
    status: 'done',
    attachments: normalizeSectionAttachments(
      undefined,
      [{ label, url: pdfUrl }],
      pdfUrl,
    ),
  }
}

function dedupeStepProgressParts(
  parts: readonly StepProgressPartInput[],
): StepProgressPartInput[] {
  const byKey = new Map<string, StepProgressPartInput>()
  for (const part of parts) {
    const data = part.data ?? {}
    if (isPerTaskToolLoopProgress(data)) continue
    if (isPerTaskForeachItemProgress(data)) continue
    const key =
      stepProgressPartKey(part) ||
      agentStepProgressStepId(data) ||
      (typeof part.id === 'string' ? part.id.trim() : '')
    if (!key) continue
    const existing = byKey.get(key)
    if (
      !existing ||
      stepProgressSequence(data) >= stepProgressSequence(existing.data ?? {})
    ) {
      byKey.set(key, part)
    }
  }
  const ordered = [...byKey.values()].sort(
    (a, b) =>
      stepProgressSequence(a.data ?? {}) - stepProgressSequence(b.data ?? {}),
  )
  if (ordered.length > 0) return ordered

  // Step transition gap: parent shells may be empty briefly while per-task rows
  // are filtered — keep the latest part that still has visible content.
  const withContent = parts.filter((part) => {
    const data = part.data ?? {}
    if (isStaleEmptyToolLoopShell(data)) return false
    return Boolean((data.content ?? '').trim() || (data.summary ?? '').trim())
  })
  if (withContent.length === 0) return ordered
  return [
    withContent.reduce((best, part) =>
      stepProgressSequence(part.data ?? {}) >=
      stepProgressSequence(best.data ?? {})
        ? part
        : best,
    ),
  ]
}

function resolveSectionStatus(
  part: StepProgressPartInput,
  partIndex: number,
  ordered: readonly StepProgressPartInput[],
  isStreaming: boolean,
): StructuredDebugSectionStatus {
  const data = part.data ?? {}
  if (isStaleEmptyToolLoopShell(data)) return 'done'
  if (data.status === 'completed') return 'done'

  const seq = stepProgressSequence(data)
  for (let j = partIndex + 1; j < ordered.length; j++) {
    const later = ordered[j]?.data ?? {}
    if (stepProgressSequence(later) > seq) {
      // Pipeline advanced (e.g. Executing → Agentic Run → Summary) even when
      // parent shells never received status: completed from the backend.
      return 'done'
    }
  }

  if (!isStreaming) {
    const hasContent = Boolean((data.content ?? '').trim())
    if (hasContent) return 'done'
  }

  return 'running'
}

function resolveStepProgressContent(data: AgentStepProgressData): string {
  const content = typeof data.content === 'string' ? data.content.trim() : ''
  if (content) return content
  const summary = typeof data.summary === 'string' ? data.summary.trim() : ''
  if (summary && data.status === 'completed') return summary
  return content
}

function stepProgressSectionId(
  data: AgentStepProgressData,
  part: StepProgressPartInput,
  sectionId: string,
  content: string,
): string {
  if (isAgentErrorText(content) || isLlmErrorProgressText(content)) {
    return 'llmError'
  }
  const stepId = agentStepProgressStepId(data)
  if (stepId === 'createPaper') return 'researchReport'
  return sectionId || stepProgressPartKey(part) || `step-${stepProgressSequence(data)}`
}

function buildAgentErrorSections(
  raw: string,
  markdown: MarkdownIt,
): StructuredDebugSection[] {
  const sections: StructuredDebugSection[] = []
  const trimmed = raw.trim()
  if (trimmed && isAgentErrorText(trimmed)) {
    sections.push({
      id: 'agentError',
      title: 'Agent error',
      bodyHtml: bodyHtmlFromMarkdown(markdown, trimmed),
      status: 'done',
    })
  }
  return sections
}

export function buildStructuredDebugViewFromStepProgress(
  parts: readonly StepProgressPartInput[],
  markdown: MarkdownIt,
  options?: { isStreaming?: boolean },
): StructuredDebugView | null {
  const ordered = dedupeStepProgressParts(parts)
  if (ordered.length === 0) return null

  const isStreaming = options?.isStreaming === true

  const sections: StructuredDebugSection[] = ordered.map((part, partIndex) => {
    const data = part.data ?? {}
    const stepId = agentStepProgressStepId(data)
    const sectionId = stepId
      ? stepIdToSectionId(stepId)
      : stepProgressPartKey(part)
    const nestedPrefix =
      typeof data.parentRunId === 'string' && data.parentRunId.trim()
        ? '↳ '
        : ''
    const title =
      nestedPrefix +
      ((typeof data.title === 'string' && data.title.trim()) ||
        renderStepLabel({
          type: sectionId as AssistantSubStepType,
          title: '',
          content: '',
        }))
    const content = resolveStepProgressContent(data)
    const attachments = normalizeSectionAttachments(
      data.attachments,
      data.outputLinks,
    )
    const isResearchReport = stepId === 'createPaper'

    const progressKey = stepProgressPartKey(part)
    const status = resolveSectionStatus(part, partIndex, ordered, isStreaming)
    const resolvedSectionId = stepProgressSectionId(
      data,
      part,
      sectionId,
      content,
    )
    const isErrorSection = resolvedSectionId === 'llmError'
    return {
      id: isResearchReport
        ? 'researchReport'
        : resolvedSectionId,
      title: isErrorSection
        ? 'LLM error'
        : isResearchReport
          ? 'Research Report'
          : title,
      bodyHtml: bodyHtmlFromMarkdown(markdown, content),
      status,
      ...(progressKey ? { progressPartKey: progressKey } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(typeof data.runId === 'string' ? { runId: data.runId } : {}),
      ...(typeof data.parentRunId === 'string'
        ? { parentRunId: data.parentRunId }
        : {}),
    }
  })

  return finalizeStructuredDebugView({ sections })
}

function buildSectionsFromStructured(
  content: AssistantStructuredContent,
  markdown: MarkdownIt,
  isStreaming: boolean,
): StructuredDebugSection[] {
  const pipeline = content.assistantContent.outer.pipelineConversation
  if (pipeline?.length && !isStreaming) {
    const sections = buildSectionsFromPipelineConversation(pipeline, markdown)
    const finalResult = content.assistantContent.outer.finalResult.trim()
    const reportFromOuter = content.assistantContent.outer.report.trim()
    if (finalResult) {
      sections.push({
        id: 'finalResult',
        title: 'Final Result',
        bodyHtml: bodyHtmlFromMarkdown(markdown, finalResult),
        status: 'done',
      })
    }
    if (reportFromOuter) {
      sections.push({
        id: 'report',
        title: 'Report',
        bodyHtml: bodyHtmlFromMarkdown(markdown, reportFromOuter),
        status: 'done',
      })
    }
    const researchReport = content.assistantContent.outer.researchReport
    if (
      researchReport?.pdfUrl?.trim() &&
      !sections.some((s) => s.id === 'researchReport')
    ) {
      sections.push(buildResearchReportSection(researchReport, markdown))
    }
    const snapshot = content.assistantContent.outer.resultSnapshot
    if (
      snapshot?.pdfUrl?.trim() &&
      !sections.some((s) => s.id === 'resultSnapshot')
    ) {
      const pdfUrl = snapshot.pdfUrl.trim()
      sections.push({
        id: 'resultSnapshot',
        title: 'Result snapshot',
        bodyHtml: '',
        status: 'done',
        attachments: normalizeSectionAttachments(
          undefined,
          [{ label: 'result-snapshot.pdf', url: pdfUrl }],
          pdfUrl,
        ),
      })
    }
    return postProcessConversationSections([
      ...sections,
      ...buildAttachmentSectionsFromStepCaptures(content).filter(
        (s) => !sections.some((existing) => existing.id === s.parentSectionId),
      ),
    ]).filter(
      (s) =>
        s.sectionKind === 'attachments' ||
        s.bodyHtml.trim() ||
        s.status === 'running' ||
        Boolean(s.previewFileUrl?.trim()),
    )
  }

  const streamingText =
    content.assistantContent.outer.streamingText?.trim() ?? ''
  const streamingByStep = splitStreamingTextByStep(streamingText)
  const finalResult = content.assistantContent.outer.finalResult.trim()
  const reportFromOuter = content.assistantContent.outer.report.trim()
  const reportFromStep =
    content.assistantContent.subSteps
      .find((s) => s.type === 'ReportStep')
      ?.content.trim() ?? ''
  const reportCombined = reportFromOuter || reportFromStep

  const baseSubSteps = content.assistantContent.subSteps
  const hasSubSteps = baseSubSteps.length > 0
  const stepEntries: AssistantSubStep[] = hasSubSteps
    ? baseSubSteps.filter((s) => s.type !== 'CreatePaperStep')
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

  const sections: StructuredDebugSection[] = stepEntries.map((step) => {
    const stepStreamingText = streamingByStep[step.type]?.trim() ?? ''
    const stepContent = [step.content.trim(), stepStreamingText]
      .filter(Boolean)
      .join('\n\n')
    const isRunning = activeSubStepType === step.type
    return {
      id: step.type,
      title: renderStepLabel(step),
      bodyHtml: bodyHtmlFromMarkdown(markdown, stepContent),
      status: isRunning ? 'running' : 'done',
    }
  })

  if (finalResult) {
    sections.push({
      id: 'finalResult',
      title: 'Final Result',
      bodyHtml: bodyHtmlFromMarkdown(markdown, finalResult),
      status: 'done',
    })
  }

  if (reportCombined) {
    sections.push({
      id: 'report',
      title: 'Report',
      bodyHtml: bodyHtmlFromMarkdown(markdown, reportCombined),
      status: 'done',
    })
  }

  const researchReport = content.assistantContent.outer.researchReport
  if (researchReport?.pdfUrl?.trim()) {
    sections.push(buildResearchReportSection(researchReport, markdown))
  }

  const snapshot = content.assistantContent.outer.resultSnapshot
  if (snapshot?.pdfUrl?.trim()) {
    const pdfUrl = snapshot.pdfUrl.trim()
    const label = 'result-snapshot.pdf'
    sections.push({
      id: 'resultSnapshot',
      title: 'Result snapshot',
      bodyHtml: '',
      status: 'done',
      attachments: normalizeSectionAttachments(
        undefined,
        [{ label: 'result-snapshot.pdf', url: pdfUrl }],
        pdfUrl,
      ),
    })
  }

  const withCaptureAttachments = [
    ...sections,
    ...buildAttachmentSectionsFromStepCaptures(content).filter(
      (s) => !sections.some((existing) => existing.id === s.parentSectionId),
    ),
  ]
  return postProcessConversationSections(withCaptureAttachments).filter(
    (s) =>
      s.sectionKind === 'attachments' ||
      s.bodyHtml.trim() ||
      s.status === 'running' ||
      Boolean(s.previewFileUrl?.trim()),
  )
}

function buildStructuredDebugViewFromRaw(
  raw: string,
  markdown: MarkdownIt,
  options?: { isStreaming?: boolean },
): StructuredDebugView | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const isStreaming = options?.isStreaming === true
  let content = parseAssistantStructuredContent(trimmed)

  if (
    !content &&
    isStreaming &&
    trimmed &&
    !JSON_STRUCTURE_START.test(trimmed)
  ) {
    content = buildLiveStructuredContent(trimmed)
  }

  if (!content) return null

  const sections = buildSectionsFromStructured(content, markdown, isStreaming)

  if (sections.length === 0) return null

  return finalizeStructuredDebugView({ sections })
}

const DEDICATED_PDF_BUBBLE_IDS = ['researchReport', 'resultSnapshot'] as const

function isDedicatedPdfBubbleSection(section: StructuredDebugSection): boolean {
  if ((DEDICATED_PDF_BUBBLE_IDS as readonly string[]).includes(section.id)) {
    return true
  }
  const parentId = section.parentSectionId?.trim()
  return Boolean(
    parentId &&
      (DEDICATED_PDF_BUBBLE_IDS as readonly string[]).includes(parentId),
  )
}

function mergeDedicatedPdfBubbleSections(
  view: StructuredDebugView,
  raw: StructuredDebugView | null,
): StructuredDebugView {
  if (!raw) return finalizeStructuredDebugView(view)
  const existing = new Set(view.sections.map((s) => s.id))
  const toAppend = raw.sections.filter(
    (s) => isDedicatedPdfBubbleSection(s) && !existing.has(s.id),
  )
  if (toAppend.length === 0) return finalizeStructuredDebugView(view)
  return finalizeStructuredDebugView({
    sections: [...view.sections, ...toAppend],
  })
}

function finalizeStructuredDebugView(
  view: StructuredDebugView,
): StructuredDebugView {
  return {
    sections: postProcessConversationSections(view.sections),
  }
}

function countVisibleStructuredSections(view: StructuredDebugView | null): number {
  if (!view) return 0
  return view.sections.filter(
    (s) =>
      s.sectionKind === 'attachments' ||
      sectionHasVisibleBody(s) ||
      Boolean(s.attachments?.length),
  ).length
}

function mergeAttachmentSectionsFromProgress(
  base: StructuredDebugView,
  fromProgress: StructuredDebugView | null,
): StructuredDebugView {
  if (!fromProgress) return finalizeStructuredDebugView(base)
  const attachmentSections = fromProgress.sections.filter(
    (s) =>
      s.sectionKind === 'attachments' ||
      (s.attachments?.length ?? 0) > 0,
  )
  if (attachmentSections.length === 0) return finalizeStructuredDebugView(base)
  const existingIds = new Set(base.sections.map((s) => s.id))
  const toAppend = attachmentSections.filter((s) => !existingIds.has(s.id))
  if (toAppend.length === 0) return finalizeStructuredDebugView(base)
  return finalizeStructuredDebugView({
    sections: [...base.sections, ...toAppend],
  })
}

export function buildStructuredDebugViewForMessage(opts: {
  raw: string
  stepProgressParts: readonly StepProgressPartInput[]
  markdown: MarkdownIt
  isStreaming?: boolean
}): StructuredDebugView | null {
  const errorSections = buildAgentErrorSections(opts.raw, opts.markdown)
  const fromProgress = buildStructuredDebugViewFromStepProgress(
    opts.stepProgressParts,
    opts.markdown,
    { isStreaming: opts.isStreaming },
  )
  const fromRaw = buildStructuredDebugViewFromRaw(opts.raw, opts.markdown, {
    isStreaming: opts.isStreaming,
  })

  const prependErrors = (view: StructuredDebugView | null): StructuredDebugView | null => {
    if (!view || errorSections.length === 0) return view
    const existingIds = new Set(view.sections.map((s) => s.id))
    const toPrepend = errorSections.filter((s) => !existingIds.has(s.id))
    if (toPrepend.length === 0) return view
    return finalizeStructuredDebugView({
      sections: [...toPrepend, ...view.sections],
    })
  }

  const progressSections = fromProgress?.sections.length ?? 0
  const rawSections = fromRaw?.sections.length ?? 0

  if (progressSections > 0 && (opts.isStreaming || rawSections === 0)) {
    return prependErrors(
      mergeDedicatedPdfBubbleSections(
        { sections: fromProgress!.sections },
        fromRaw,
      ),
    )
  }

  if (!opts.isStreaming && progressSections > 0 && rawSections > 0) {
    return prependErrors(
      mergeDedicatedPdfBubbleSections(
        { sections: fromProgress!.sections },
        fromRaw,
      ),
    )
  }

  if (rawSections > 0) {
    const rawView = finalizeStructuredDebugView(fromRaw!)
    if (countVisibleStructuredSections(rawView) > 0 || progressSections === 0) {
      return prependErrors(
        mergeAttachmentSectionsFromProgress(rawView, fromProgress),
      )
    }
    return prependErrors(
      mergeDedicatedPdfBubbleSections(fromProgress!, fromRaw),
    )
  }

  if (fromProgress) {
    return prependErrors(
      mergeDedicatedPdfBubbleSections(fromProgress, fromRaw),
    )
  }
  if (fromRaw) {
    return prependErrors(finalizeStructuredDebugView(fromRaw))
  }
  if (errorSections.length > 0) {
    return finalizeStructuredDebugView({ sections: errorSections })
  }
  return fromRaw
}

export function messageHasStructuredDebugTimelineSource(
  raw: string,
  stepProgressParts: readonly StepProgressPartInput[],
): boolean {
  if (stepProgressParts.length > 0) return true
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (parseAssistantStructuredContent(trimmed)) return true
  if (!JSON_STRUCTURE_START.test(trimmed)) {
    const steps = splitStreamingTextByStep(trimmed)
    if (Object.keys(steps).length > 0) return true
  }
  return trimmed.length > 0
}
