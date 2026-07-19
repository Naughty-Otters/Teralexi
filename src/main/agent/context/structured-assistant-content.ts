import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { limitMessageContentForPersistence } from '@shared/persistence/limit-persisted-content'
import {
  dedupeStepAttachments,
  type StepAttachment,
} from '@shared/agent/step-attachment'
import type {
  AssistantSubStep,
  AssistantStructuredContent,
  ResearchReportRef,
  StepRunCapture,
} from '../types'
import type { AgentFlowContext } from '../context'
import type { FlowStageId } from '../constants/step-ids'
import {
  CREATE_PAPER_STEP_ID,
  PLANNING_STEP_ID,
  REPORT_STEP_ID,
  SEARCH_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
  TOOL_LOOP_STEP_TITLE,
  WEB_SCRAPE_STEP_ID,
} from '../constants/step-ids'
import { STRUCTURED_CONTENT_LLM } from '../constants'
import { summaryDisplayText } from '../utils/summary-parse'
import type { StepOutputStore } from '../steps/step-output-store'
import type { CreatePaperStepData } from '../steps/step-io'
import {
  buildOutputLinksFromPaths,
  collectSandboxOutputLinkPaths,
  sandboxOutputDir,
} from '../sandbox/step-output-links'
import { buildPipelineConversationTurns } from '../pipeline-conversation-persist'
import {
  collectSandboxArtifactPaths,
  uniqueStrings,
} from './sandbox-artifact-paths'

function flowStageIdForStepCapture(
  stepType: StepRunCapture['stepType'],
): FlowStageId | undefined {
  switch (stepType) {
    case 'ThinkingStep':
      return THINKING_STEP_ID
    case 'PlanningStep':
      return PLANNING_STEP_ID
    case 'SearchStep':
      return SEARCH_STEP_ID
    case 'WebScrapeStep':
      return WEB_SCRAPE_STEP_ID
    case 'CreatePaperStep':
      return CREATE_PAPER_STEP_ID
    case 'SkillsToolExecutionStep':
      return TOOL_LOOP_STEP_ID
    case 'SummaryStep':
      return SUMMARY_STEP_ID
    case 'ReportStep':
      return REPORT_STEP_ID
    default:
      return undefined
  }
}

function buildResearchReportRef(
  outputStore: StepOutputStore,
): ResearchReportRef | undefined {
  const entries = outputStore.all(CREATE_PAPER_STEP_ID)
  if (entries.length === 0) return undefined
  const data = entries[entries.length - 1]?.data as
    | CreatePaperStepData
    | undefined
  const pdfPath = data?.outputPath?.trim()
  if (!pdfPath) return undefined
  try {
    const paperExcerpt = data.rendered?.trim() || data.text?.trim()
    return {
      pdfPath,
      pdfUrl: pathToFileURL(pdfPath).href,
      topic: data.topic ?? '',
      sourceCount: data.sourceCount ?? 0,
      ...(paperExcerpt ? { paperExcerpt } : {}),
    }
  } catch {
    return undefined
  }
}

function latestCreatePaperDigest(outputStore: StepOutputStore): string {
  const entries = outputStore.all(CREATE_PAPER_STEP_ID)
  if (entries.length === 0) return ''
  const data = entries[entries.length - 1]?.data as
    | CreatePaperStepData
    | undefined
  return data?.rendered?.trim() || data?.text?.trim() || ''
}

export function buildStructuredAssistantContent(
  host: AgentFlowContext,
): string {
  const reg = host.pipelineRegistry
  const planning = host.stepOutputs.planning
  const planRaw = planning?.raw?.trim() ?? ''
  const toolOutput = host.stepOutputs.toolLoop?.trim() ?? ''
  const skillsOutput = host.stepOutputs.skills?.trim() ?? ''
  const runSummary = host.stepOutputs.summary
    ? summaryDisplayText(host.stepOutputs.summary)
    : ''
  const report = host.stepOutputs.report?.trim() ?? ''

  const subSteps: AssistantSubStep[] = []
  const stepCaptures: StepRunCapture[] = []

  const sandboxOutputPaths = collectSandboxOutputLinkPaths(host.sandbox)

  const thinkingRaw = host.stepOutputs.thinking?.raw?.trim() ?? ''
  const directAnswerResponse =
    host.stepOutputs.thinking?.execution_mode === 'direct_answer'
      ? host.stepOutputs.thinking?.response?.trim() ?? ''
      : ''

  const stageOrder: FlowStageId[] = [
    THINKING_STEP_ID,
    PLANNING_STEP_ID,
    SEARCH_STEP_ID,
    WEB_SCRAPE_STEP_ID,
    CREATE_PAPER_STEP_ID,
    TOOL_LOOP_STEP_ID,
    SUMMARY_STEP_ID,
    REPORT_STEP_ID,
  ]
  if (reg) {
    for (const stageId of stageOrder) {
      const def = reg.get(stageId)
      const entries = host.outputStore.all(stageId)
      if (!def || entries.length === 0) continue
      const sub = def.toSubStep?.(entries, host)
      if (sub) subSteps.push(sub)
      const cap = def.toStepCapture?.(entries, host)
      if (cap) stepCaptures.push(cap)
    }
  } else {
    if (thinkingRaw) {
      subSteps.push({
        type: 'ThinkingStep',
        title: 'Thinking',
        content: thinkingRaw,
      })
      stepCaptures.push({
        stepType: 'ThinkingStep',
        title: 'Thinking',
        content: thinkingRaw,
        outputPaths: [],
      })
    }
    if (planRaw) {
      subSteps.push({
        type: 'PlanningStep',
        title: 'Planning',
        content: planRaw,
      })
      stepCaptures.push({
        stepType: 'PlanningStep',
        title: 'Planning',
        content: planRaw,
        outputPaths: [],
      })
    }
    const toolExecutionContent = [toolOutput, skillsOutput]
      .filter(Boolean)
      .join('\n\n')
      .trim()
    if (toolExecutionContent) {
      subSteps.push({
        type: 'SkillsToolExecutionStep',
        title: TOOL_LOOP_STEP_TITLE,
        content: toolExecutionContent,
      })
      stepCaptures.push({
        stepType: 'SkillsToolExecutionStep',
        title: TOOL_LOOP_STEP_TITLE,
        content: toolExecutionContent,
        outputPaths:
          sandboxOutputPaths.length > 0 ? [...sandboxOutputPaths] : [],
      })
    }
    if (runSummary) {
      subSteps.push({
        type: 'SummaryStep',
        title: 'Summary',
        content: runSummary,
      })
      stepCaptures.push({
        stepType: 'SummaryStep',
        title: 'Summary',
        content: runSummary,
        outputPaths: [],
      })
    }
    if (report) {
      subSteps.push({ type: 'ReportStep', title: 'Report', content: report })
      const reportPaths =
        host.sandbox.layout != null
          ? [
              join(
                host.sandbox.layout.root,
                'output',
                'results',
                'result-snapshot.pdf',
              ),
            ]
          : []
      stepCaptures.push({
        stepType: 'ReportStep',
        title: 'Report',
        content: report,
        outputPaths: reportPaths,
      })
    }
  }

  const planningRefPaths = uniqueStrings(
    (planning?.todoList ?? []).flatMap((t) => [
      ...(t.reference_doc?.map((d) =>
        host.references.referenceLocationString(d),
      ) ?? []),
      ...(t.reference_scripts?.map((s) =>
        host.references.referenceLocationString(s),
      ) ?? []),
    ]),
  )

  const completedTodoOutputs =
    planning?.todoList
      .filter((item) => item.status === 'completed' && item.output?.trim())
      .map(
        (item) =>
          `${STRUCTURED_CONTENT_LLM.COMPLETED_TASK.replace('{id}', String(item.id)).replace('{description}', item.description)}\n${item.output!.trim()}`,
      ) ?? []

  const finalGoalResult =
    completedTodoOutputs.length > 0
      ? [
          planning?.finalGoal?.trim()
            ? `${STRUCTURED_CONTENT_LLM.GOAL_PREFIX} ${planning.finalGoal.trim()}`
            : '',
          ...completedTodoOutputs,
        ]
          .filter(Boolean)
          .join('\n\n')
      : ''

  const toolExecutionContent = [toolOutput, skillsOutput]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  const createPaperDigest = latestCreatePaperDigest(host.outputStore)

  const aggregatedSections: string[] = []
  if (directAnswerResponse) {
    aggregatedSections.push(directAnswerResponse)
  }
  if (thinkingRaw) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_THINKING}\n\n${thinkingRaw}`,
    )
  }
  if (finalGoalResult) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_GOALS_COMPLETED}\n\n${finalGoalResult}`,
    )
  } else if (planRaw) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_PLANNING}\n\n${planRaw}`,
    )
  }
  if (toolExecutionContent) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_SKILLS_TOOL}\n\n${toolExecutionContent}`,
    )
  }
  if (runSummary) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_SUMMARY}\n\n${runSummary}`,
    )
  }
  if (report) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_REPORT}\n\n${report}`,
    )
  } else if (createPaperDigest) {
    aggregatedSections.push(
      `${STRUCTURED_CONTENT_LLM.SECTION_RESEARCH_REPORT}\n\n${createPaperDigest}`,
    )
  }

  const aggregatedFinal = aggregatedSections
    .join(STRUCTURED_CONTENT_LLM.SECTION_SEPARATOR)
    .trim()

  const legacyFallback =
    directAnswerResponse ||
    finalGoalResult ||
    report ||
    createPaperDigest ||
    skillsOutput ||
    toolOutput ||
    runSummary ||
    thinkingRaw ||
    ''

  const finalResult = aggregatedFinal || legacyFallback

  const researchReport = buildResearchReportRef(host.outputStore)
  const pipelineConversation = buildPipelineConversationTurns(host)

  const allArtifactPaths = uniqueStrings([
    ...planningRefPaths,
    ...collectSandboxArtifactPaths(host.sandbox),
    ...stepCaptures.flatMap((s) => s.outputPaths),
    ...(researchReport ? [researchReport.pdfPath] : []),
  ])

  const outputRoot = host.sandbox.getRoot()
    ? sandboxOutputDir(host.sandbox.getRoot()!)
    : undefined

  for (let i = 0; i < stepCaptures.length; i++) {
    const capture = stepCaptures[i]!
    const stageId = flowStageIdForStepCapture(capture.stepType)
    const attachments = stageId
      ? host.getAggregatedAttachmentsForStage(stageId)
      : []
    const pathLinks = buildOutputLinksFromPaths(capture.outputPaths, {
      restrictToDir: outputRoot,
    })
    const pathAttachments: StepAttachment[] = []
    for (const link of pathLinks) {
      let absPath = link.url
      try {
        absPath = fileURLToPath(link.url)
      } catch {
        /* keep url as path fallback */
      }
      pathAttachments.push({
        path: absPath,
        label: link.label,
        url: link.url,
      })
    }
    const merged = dedupeStepAttachments([...attachments, ...pathAttachments])
    if (merged.length > 0) {
      capture.attachments = merged
    }
  }

  const structuredContent: AssistantStructuredContent = {
    version: 2,
    assistantContent: {
      outer: {
        finalResult,
        report,
        stepCaptures: stepCaptures.length > 0 ? stepCaptures : undefined,
        allArtifactPaths:
          allArtifactPaths.length > 0 ? allArtifactPaths : undefined,
        ...(researchReport ? { researchReport } : {}),
        ...(pipelineConversation.length > 0 ? { pipelineConversation } : {}),
      },
      subSteps,
    },
  }

  return limitMessageContentForPersistence(
    JSON.stringify(structuredContent),
    'assistant',
  )
}
