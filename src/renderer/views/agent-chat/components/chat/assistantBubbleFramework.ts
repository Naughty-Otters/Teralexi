import {
  isToolOrDynamicToolUIPart,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from '@teralexi-ai'
import { isCollectFormRequestPart } from './collectFormTypes'
import {
  classifyToolResult,
  formatToolOutput,
  getToolPartErrorText,
  getToolPartInput,
  getToolPartState,
  isFileChangeToolPart,
  isRunningState,
  isTerminalToolRunning,
  isTodoToolPart,
  shouldShowApprovedFileChangePart,
  shouldShowIncidentalFileChangePart,
  toolPartNeedsApproval,
} from './chatToolPartHelpers'
import {
  AGENT_ERROR_TEXT_PREFIX,
  isAgentErrorText,
  isLlmErrorProgressText,
  LLM_ERROR_PROGRESS_MARKER,
} from '@shared/agent/llm-error-ui'
import {
  buildToolRunScopeIndex,
  isSubAgentToolPart,
} from '../../toolRunScope'

export type AssistantBubbleKind =
  | 'markdown'
  | 'reasoning'
  | 'list-items'
  | 'step-progress'
  | 'form'
  | 'approval'
  | 'diff'
  | 'terminal'
  | 'tool'
  | 'tool-group'
  | 'error'

export interface AssistantToolGroupPayload {
  items: AssistantBubbleDescriptor[]
}

export interface AssistantListBubbleItem {
  id: string
  title: string
  description?: string
  details: string[]
}

export interface AssistantListBubbleData {
  title: string
  finalGoal?: string
  expectations: string[]
  items: AssistantListBubbleItem[]
}

export interface AssistantBubbleDescriptor {
  key: string
  kind: AssistantBubbleKind
  part: unknown
  payload?: unknown
}

export interface AssistantBubbleResolveOptions {
  structuredLayoutEnabled: boolean
  shouldShowStepProgress: (message: UIMessage, part: unknown) => boolean
}

export function isTextUIPart(part: unknown): boolean {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: string }).type === 'text'
  )
}

export function isReasoningUIPart(part: unknown): boolean {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: string }).type === 'reasoning'
  )
}

export function isReasoningUIPartWithContent(part: unknown): boolean {
  if (!isReasoningUIPart(part)) return false
  const t = (part as { text?: string }).text ?? ''
  return t.trim().length > 0
}

export function isTextUIPartWithContent(part: unknown): boolean {
  if (!isTextUIPart(part)) return false
  const t = (part as { text?: string }).text ?? ''
  return t.trim().length > 0
}

export { AGENT_ERROR_TEXT_PREFIX, LLM_ERROR_PROGRESS_MARKER }

export function isAgentErrorTextPart(part: unknown): boolean {
  if (!isTextUIPartWithContent(part)) return false
  const text = String((part as { text?: string }).text ?? '').trim()
  return isAgentErrorText(text)
}

export function agentErrorTextFromPart(part: unknown): string {
  if (!isTextUIPart(part)) return ''
  return String((part as { text?: string }).text ?? '').trim()
}

/** Collect user-visible LLM/agent error lines from an assistant message. */
export function extractVisibleLlmErrorsFromMessage(
  message: UIMessage,
): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const push = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    errors.push(trimmed)
  }

  for (const part of message.parts) {
    if (isTextUIPartWithContent(part)) {
      const text = agentErrorTextFromPart(part)
      if (isAgentErrorText(text) || isLlmErrorProgressText(text)) {
        push(text)
      }
      continue
    }
    if (part.type === 'data-agent-step-progress') {
      const data = (part as { data?: { content?: string; summary?: string } })
        .data
      const content = typeof data?.content === 'string' ? data.content : ''
      const summary = typeof data?.summary === 'string' ? data.summary : ''
      for (const chunk of [content, summary]) {
        if (isLlmErrorProgressText(chunk) || isAgentErrorText(chunk)) {
          push(chunk.trim())
        }
      }
    }
  }

  return errors
}

function parsePlanningListData(
  text: string,
): AssistantListBubbleData | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  const lines = trimmed.split(/\r?\n/)
  const normalize = (line: string) => line.trim().replace(/^#{1,6}\s*/, '')

  const finalGoalLine = lines.find((line) =>
    /^(🎯\s*)?Final goal:/i.test(normalize(line)),
  )
  const todoHeaderIndex = lines.findIndex((line) =>
    /^Todo list:?$/i.test(normalize(line)),
  )

  if (!finalGoalLine && todoHeaderIndex < 0) {
    return undefined
  }

  const finalGoal = finalGoalLine
    ? normalize(finalGoalLine)
        .replace(/^(🎯\s*)?Final goal:\s*/i, '')
        .trim()
    : undefined

  const expectations: string[] = []
  const expectationsHeaderIndex = lines.findIndex((line) =>
    /^Success expectations/i.test(normalize(line)),
  )
  if (expectationsHeaderIndex >= 0) {
    for (let i = expectationsHeaderIndex + 1; i < lines.length; i++) {
      const line = normalize(lines[i])
      if (!line) continue
      if (/^Todo list:?$/i.test(line)) break
      const match = line.match(/^\d+[.)]\s+(.+)$/)
      if (match) {
        expectations.push(match[1].trim())
        continue
      }
      const bullet = line.match(/^[-*]\s+(.+)$/)
      if (bullet) {
        expectations.push(bullet[1].trim())
      }
    }
  }

  const items: AssistantListBubbleItem[] = []
  if (todoHeaderIndex >= 0) {
    let current: AssistantListBubbleItem | null = null
    for (let i = todoHeaderIndex + 1; i < lines.length; i++) {
      const line = normalize(lines[i])
      if (!line) continue

      const itemMatch = line.match(/^([0-9]+)[.)]\s+(?:[^\w\s]+\s*)?(.+)$/)
      const bulletItemMatch = line.match(/^[-*]\s+(?:\[[ xX]\]\s*)?(.+)$/)

      const normalizedItem = itemMatch
        ? { id: itemMatch[1], text: itemMatch[2] }
        : bulletItemMatch
          ? { id: String(items.length + 1), text: bulletItemMatch[1] }
          : null

      if (normalizedItem) {
        const titleAndDesc = normalizedItem.text.trim()
        if (/^(✓|↩|📎)\s*/.test(titleAndDesc) && current) {
          current.details.push(titleAndDesc)
          continue
        }
        const colonIndex = titleAndDesc.indexOf(':')
        const title =
          colonIndex >= 0
            ? titleAndDesc.slice(0, colonIndex).trim()
            : titleAndDesc
        const description =
          colonIndex >= 0 ? titleAndDesc.slice(colonIndex + 1).trim() : ''
        current = {
          id: normalizedItem.id,
          title,
          ...(description ? { description } : {}),
          details: [],
        }
        items.push(current)
        continue
      }

      if (current && /^(✓|↩|📎)/.test(line)) {
        current.details.push(line)
      }
    }
  }

  if (items.length === 0) return undefined

  return {
    title: 'Exploring items',
    ...(finalGoal ? { finalGoal } : {}),
    expectations,
    items,
  }
}

function asPlanningStepProgressContent(part: unknown): string {
  if (!part || typeof part !== 'object') return ''
  const p = part as {
    type?: string
    data?: { content?: unknown; stepId?: unknown; title?: unknown }
  }
  if (p.type !== 'data-agent-step-progress') return ''

  const stepId =
    typeof p.data?.stepId === 'string' ? p.data.stepId.toLowerCase() : ''
  const title =
    typeof p.data?.title === 'string' ? p.data.title.toLowerCase() : ''
  const content = typeof p.data?.content === 'string' ? p.data.content : ''

  if (!content.trim()) return ''
  if (stepId === 'planning' || title.includes('planning')) {
    return content
  }
  return ''
}

function hasRenderableToolPayload(part: unknown): boolean {
  const input = getToolPartInput(part)
  const output = formatToolOutput(part)
  const errorText = getToolPartErrorText(part)
  if (input !== undefined && input !== null) return true
  if (output.trim().length > 0) return true
  if (errorText.trim().length > 0) return true
  return false
}

/** A tool part renders as a terminal bubble when its result is terminal-shaped. */
function isTerminalToolPart(part: unknown): boolean {
  return classifyToolResult(part) === 'terminal'
}

function isAgentStepProgressPart(part: unknown): boolean {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: string }).type === 'data-agent-step-progress'
  )
}

function agentStepProgressStepId(data: {
  stepId?: unknown
}): string {
  const stepId = data.stepId
  return typeof stepId === 'string' ? stepId.trim() : ''
}

/** True when this assistant turn includes an Agentic Run / tool-loop step. */
export function messageHasToolLoopAgent(message: UIMessage): boolean {
  for (const part of message.parts) {
    if (!isAgentStepProgressPart(part)) continue
    const data = (part as { data?: { stepId?: unknown } }).data ?? {}
    if (agentStepProgressStepId(data) === 'toolLoop') return true
  }
  return false
}

function isToolLoopGroupableBubble(bubble: AssistantBubbleDescriptor): boolean {
  return bubble.kind === 'tool' || bubble.kind === 'terminal'
}

function toolGroupItemIsRunning(bubble: AssistantBubbleDescriptor): boolean {
  if (bubble.kind === 'terminal') {
    return isTerminalToolRunning(bubble.part)
  }
  const state = getToolPartState(bubble.part)
  return isRunningState(state)
}

function collapseToolLoopBubbles(
  bubbles: AssistantBubbleDescriptor[],
  message: UIMessage,
): AssistantBubbleDescriptor[] {
  if (!messageHasToolLoopAgent(message)) return bubbles

  const out: AssistantBubbleDescriptor[] = []
  let batch: AssistantBubbleDescriptor[] = []

  const flushBatch = () => {
    if (batch.length === 0) return
    out.push({
      key: `tool-group-${batch[0]!.key}`,
      kind: 'tool-group',
      part: null,
      payload: { items: batch } satisfies AssistantToolGroupPayload,
    })
    batch = []
  }

  for (const bubble of bubbles) {
    if (isToolLoopGroupableBubble(bubble)) {
      batch.push(bubble)
      continue
    }
    flushBatch()
    out.push(bubble)
  }
  flushBatch()
  return out
}

export function toolGroupHasRunningItem(
  payload: AssistantToolGroupPayload,
): boolean {
  return payload.items.some(toolGroupItemIsRunning)
}

function shouldShowToolResultBubble(part: unknown): boolean {
  const p = part as UIMessagePart<any, UITools>
  if (!isToolOrDynamicToolUIPart(p)) return false
  if (toolPartNeedsApproval(part)) return false
  if (shouldShowApprovedFileChangePart(part)) return false
  if (shouldShowIncidentalFileChangePart(part)) return false
  if (isTerminalToolPart(part)) return false
  if (isFileChangeToolPart(part)) return false

  const state = getToolPartState(part)
  const visibleStates = new Set([
    'input-streaming',
    'input-available',
    'approval-responded',
    'output-available',
    'output-error',
    'output-denied',
  ])
  if (!visibleStates.has(state)) return false
  return hasRenderableToolPayload(part)
}

export function resolveAssistantBubbles(
  message: UIMessage,
  options: AssistantBubbleResolveOptions,
): AssistantBubbleDescriptor[] {
  const out: AssistantBubbleDescriptor[] = []
  const scopeIndex = buildToolRunScopeIndex(message)

  for (const [index, part] of message.parts.entries()) {
    const key = `${message.id}-p-${index}`

    if (isReasoningUIPartWithContent(part)) {
      out.push({ key, kind: 'reasoning', part })
      continue
    }

    if (isTextUIPartWithContent(part) && !options.structuredLayoutEnabled) {
      const text = String((part as { text?: string }).text ?? '')
      if (isAgentErrorTextPart(part)) {
        out.push({ key, kind: 'error', part })
        continue
      }
      const planningData = parsePlanningListData(text)
      if (planningData) {
        out.push({ key, kind: 'list-items', part, payload: planningData })
      } else {
        out.push({ key, kind: 'markdown', part })
      }
      continue
    }

    if (
      options.shouldShowStepProgress(message, part) &&
      !options.structuredLayoutEnabled
    ) {
      const planningContent = asPlanningStepProgressContent(part)
      const planningData = planningContent
        ? parsePlanningListData(planningContent)
        : undefined
      if (planningData) {
        out.push({ key, kind: 'list-items', part, payload: planningData })
      } else {
        out.push({ key, kind: 'step-progress', part })
      }
      continue
    }

    if (isCollectFormRequestPart(part)) {
      out.push({ key, kind: 'form', part })
      continue
    }

    if (toolPartNeedsApproval(part)) {
      out.push({ key, kind: 'approval', part })
      continue
    }

    // Nested explore/bash tools nest under ChatSubAgentBubble.
    if (isSubAgentToolPart(part, scopeIndex)) {
      continue
    }

    if (
      isTodoToolPart(part) &&
      getToolPartState(part) === 'output-available'
    ) {
      out.push({ key, kind: 'tool', part })
      continue
    }

    if (shouldShowApprovedFileChangePart(part)) {
      out.push({ key, kind: 'diff', part })
      continue
    }

    if (isTerminalToolPart(part)) {
      out.push({ key, kind: 'terminal', part })
      // Shell/script may also carry workspace `files[]` diffs — show both.
      if (shouldShowIncidentalFileChangePart(part)) {
        out.push({ key: `${key}-diff`, kind: 'diff', part })
      }
      continue
    }

    if (shouldShowIncidentalFileChangePart(part)) {
      out.push({ key, kind: 'diff', part })
      continue
    }

    if (shouldShowToolResultBubble(part)) {
      out.push({ key, kind: 'tool', part })
      continue
    }
  }

  return collapseToolLoopBubbles(out, message)
}

/** Form and tool-approval parts — always shown outside structured/timeline layouts. */
export function resolveHitlBubbles(
  message: UIMessage,
): AssistantBubbleDescriptor[] {
  return resolveAssistantBubbles(message, {
    structuredLayoutEnabled: false,
    shouldShowStepProgress: () => false,
  }).filter((bubble) => bubble.kind === 'form' || bubble.kind === 'approval')
}
