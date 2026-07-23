import {
  isToolOrDynamicToolUIPart,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from '@teralexi-ai'
import { parseToolFileChanges } from '@shared/file-change/parse-tool-file-changes'
import {
  classifyToolResult,
  formatToolOutput,
  getToolPartErrorText,
  getToolPartOutput,
  getToolPartState,
  getToolResultType,
  isTodoToolPart,
  parseTodoToolPart,
  toolPartDisplayName,
  toolPartNeedsApproval,
} from './chatToolPartHelpers'
import {
  agentStepProgressStepId,
  isPerTaskForeachItemProgress,
  isStaleEmptyToolLoopShell,
  stepProgressPartKey,
  stepProgressSequence,
  type AgentStepProgressData,
} from '../../stepProgressDisplay'
import {
  buildToolRunScopeIndex,
  isSubAgentToolPart,
} from '../../toolRunScope'
import {
  messageHasToolLoopAgent,
  type AssistantBubbleDescriptor,
} from './assistantBubbleFramework'
import type {
  StepProgressPartInput,
  StructuredDebugSection,
} from '../../structuredDebugViewModel'

export type ConversationToolResponseViewer =
  | 'diff'
  | 'patch'
  | 'file'
  | 'terminal'
  | 'code'
  | 'todo'
  | 'raw'

export type ConversationToolResponseBubble = {
  key: string
  part: unknown
  viewer: ConversationToolResponseViewer
  toolName: string
}

export type ToolLoopProgressAnchor = {
  key: string
  stepId: string
  sequence: number
  status?: string
}

export type ConversationToolLoopPanelSlot = {
  key: string
  sectionIndex: number
  items: AssistantBubbleDescriptor[]
  live: boolean
}

function asOutputRecord(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  return output as Record<string, unknown>
}

function hasRenderableToolResponse(part: unknown): boolean {
  const state = getToolPartState(part)
  if (state === 'output-available' || state === 'output-error') return true
  if (getToolPartErrorText(part).trim()) return true
  return false
}

export function classifyConversationToolViewer(
  part: unknown,
): ConversationToolResponseViewer | null {
  if (!hasRenderableToolResponse(part)) return null
  if (toolPartNeedsApproval(part)) return null

  if (isTodoToolPart(part) && parseTodoToolPart(part)?.length) {
    return 'todo'
  }

  const output = getToolPartOutput(part)
  const fileChanges = parseToolFileChanges(output)
  if (fileChanges.length > 0) return 'diff'

  const name = toolPartDisplayName(part)
  const record = asOutputRecord(output)
  if (/patch/i.test(name) || (record && typeof record.patch === 'string')) {
    return 'patch'
  }

  if (classifyToolResult(part) === 'terminal') return 'terminal'

  const resultType = getToolResultType(part)
  if (resultType === 'query') return 'file'

  if (record) {
    if (typeof record.content === 'string' && record.content.trim()) return 'file'
    if (typeof record.text === 'string' && record.text.trim()) return 'file'
  }

  const formatted = formatToolOutput(part).trim()
  if (
    formatted &&
    (formatted.startsWith('{') ||
      formatted.startsWith('[') ||
      formatted.includes('```'))
  ) {
    return 'code'
  }

  if (formatted) return 'raw'
  if (getToolPartErrorText(part).trim()) return 'raw'
  return null
}

function bubbleKeyForPart(
  messageId: string,
  index: number,
  part: unknown,
): string {
  const toolCallId = (part as { toolCallId?: string }).toolCallId
  if (typeof toolCallId === 'string' && toolCallId.trim()) {
    return `${messageId}-conv-tool-${toolCallId.trim()}`
  }
  return `${messageId}-conv-tool-${index}`
}

/** Keep only the latest todo checklist — read_todos + update_todos often duplicate. */
function dedupeLatestTodoToolBubble(
  bubbles: ConversationToolResponseBubble[],
): ConversationToolResponseBubble[] {
  let lastTodoIndex = -1
  for (let i = 0; i < bubbles.length; i++) {
    if (bubbles[i]?.viewer === 'todo') lastTodoIndex = i
  }
  if (lastTodoIndex < 0) return bubbles
  return bubbles.filter(
    (bubble, index) => bubble.viewer !== 'todo' || index === lastTodoIndex,
  )
}

function tryBuildConversationToolBubble(
  message: UIMessage,
  index: number,
  part: UIMessagePart<any, UITools>,
  scopeIndex: Map<string, { runId: string; parentRunId: string }>,
): ConversationToolResponseBubble | null {
  if (!isToolOrDynamicToolUIPart(part)) return null
  // Nested sub-agent tools render under ChatSubAgentBubble, not root Exploring.
  // HITL approvals still surface on the parent message via approval bubbles.
  if (
    isSubAgentToolPart(part, scopeIndex) &&
    !toolPartNeedsApproval(part)
  ) {
    return null
  }
  const viewer = classifyConversationToolViewer(part)
  if (!viewer) return null
  return {
    key: bubbleKeyForPart(message.id, index, part),
    part,
    viewer,
    toolName: toolPartDisplayName(part),
  }
}

export function resolveConversationToolResponseBubbles(
  message: UIMessage,
): ConversationToolResponseBubble[] {
  const scopeIndex = buildToolRunScopeIndex(message)
  const out: ConversationToolResponseBubble[] = []

  for (const [index, part] of message.parts.entries()) {
    const bubble = tryBuildConversationToolBubble(
      message,
      index,
      part as UIMessagePart<any, UITools>,
      scopeIndex,
    )
    if (bubble) out.push(bubble)
  }

  return dedupeLatestTodoToolBubble(out)
}

/** All file-change previews from tool parts on a message (no viewer gate). */
export function collectMessageFileChangePreviews(
  message: UIMessage,
): ReturnType<typeof parseToolFileChanges> {
  const out: ReturnType<typeof parseToolFileChanges> = []
  const seen = new Set<string>()

  const pushFiles = (output: unknown) => {
    for (const file of parseToolFileChanges(output)) {
      const key = `${file.path}\0${file.diff}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(file)
    }
  }

  for (const part of message.parts) {
    if (!isToolOrDynamicToolUIPart(part as UIMessagePart<any, UITools>)) continue
    pushFiles(getToolPartOutput(part))
    // Some SDK shapes keep the raw execute payload alongside `output`.
    const row = part as { result?: unknown; preliminary?: unknown }
    if (row.result !== undefined) pushFiles(row.result)
    if (row.preliminary !== undefined) pushFiles(row.preliminary)
  }
  return out
}

/** Step-progress rows that start a tool-loop tool panel. */
export function isToolLoopPanelBoundary(
  data: AgentStepProgressData,
): boolean {
  const stepId = agentStepProgressStepId(data)
  if (stepId === 'toolLoop') return !isStaleEmptyToolLoopShell(data)
  if (stepId === 'foreachItem') return !isPerTaskForeachItemProgress(data)
  return false
}

function latestToolLoopShellAnchor(
  parts: readonly StepProgressPartInput[],
): ToolLoopProgressAnchor | null {
  let latest: ToolLoopProgressAnchor | null = null
  for (const part of parts) {
    const data = part.data ?? {}
    if (agentStepProgressStepId(data) !== 'toolLoop') continue
    const key = stepProgressPartKey(part)
    if (!key) continue
    const candidate: ToolLoopProgressAnchor = {
      key,
      stepId: 'toolLoop',
      sequence: stepProgressSequence(data),
      status: typeof data.status === 'string' ? data.status : undefined,
    }
    if (
      !latest ||
      candidate.sequence >= latest.sequence
    ) {
      latest = candidate
    }
  }
  return latest
}

/** Ordered tool-loop anchors from raw step-progress parts (includes per-task loops). */
export function listToolLoopProgressAnchors(
  parts: readonly StepProgressPartInput[],
): ToolLoopProgressAnchor[] {
  const byKey = new Map<string, ToolLoopProgressAnchor>()
  const order: string[] = []

  for (const part of parts) {
    const data = part.data ?? {}
    if (!isToolLoopPanelBoundary(data)) continue
    const key = stepProgressPartKey(part)
    if (!key) continue
    if (!byKey.has(key)) order.push(key)
    byKey.set(key, {
      key,
      stepId: agentStepProgressStepId(data),
      sequence: stepProgressSequence(data),
      status: typeof data.status === 'string' ? data.status : undefined,
    })
  }

  if (order.length > 0) {
    return order.map((key) => byKey.get(key)!)
  }

  const shell = latestToolLoopShellAnchor(parts)
  return shell ? [shell] : []
}

/** Assign tool bubbles to tool-loop runs using part order between progress boundaries. */
export function partitionToolsByToolLoopBoundaries(
  message: UIMessage,
  anchors: readonly ToolLoopProgressAnchor[],
): Map<string, ConversationToolResponseBubble[]> {
  const scopeIndex = buildToolRunScopeIndex(message)
  const anchorKeys = new Set(anchors.map((anchor) => anchor.key))
  const buckets = new Map<string, ConversationToolResponseBubble[]>()
  for (const key of anchorKeys) buckets.set(key, [])

  let currentKey: string | null = null

  for (const [index, part] of message.parts.entries()) {
    if (part.type === 'data-agent-step-progress') {
      const key = stepProgressPartKey(part as StepProgressPartInput)
      if (key && anchorKeys.has(key)) currentKey = key
      continue
    }

    const bubble = tryBuildConversationToolBubble(
      message,
      index,
      part as UIMessagePart<any, UITools>,
      scopeIndex,
    )
    if (!bubble || !currentKey) continue
    buckets.get(currentKey)?.push(bubble)
  }

  for (const [key, bubbles] of buckets) {
    buckets.set(key, dedupeLatestTodoToolBubble(bubbles))
  }

  assignUnpartitionedToolsToLastAnchor(message, anchors, buckets)

  return buckets
}

function toolBubbleLooksInFlight(part: unknown): boolean {
  const state = getToolPartState(part)
  return (
    state !== 'output-available' &&
    state !== 'output-error' &&
    state !== 'output-denied' &&
    state !== 'approval-responded'
  )
}

function assignUnpartitionedToolsToLastAnchor(
  message: UIMessage,
  anchors: readonly ToolLoopProgressAnchor[],
  buckets: Map<string, ConversationToolResponseBubble[]>,
): void {
  if (anchors.length === 0) return
  const all = resolveConversationToolResponseBubbles(message)
  const assignedKeys = new Set(
    [...buckets.values()].flat().map((bubble) => bubble.key),
  )
  const orphans = all.filter((bubble) => !assignedKeys.has(bubble.key))
  if (orphans.length === 0) return
  const lastKey = anchors[anchors.length - 1]!.key
  buckets.set(
    lastKey,
    dedupeLatestTodoToolBubble([...(buckets.get(lastKey) ?? []), ...orphans]),
  )
}

export function lastToolLoopSectionIndex(
  sections: readonly StructuredDebugSection[],
): number {
  let fallback = -1
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    if (!section || section.sectionKind === 'attachments') continue
    if (
      section.id === 'SkillsToolExecutionStep' ||
      section.id === 'toolLoop' ||
      section.progressPartKey
    ) {
      fallback = i
    }
  }
  return fallback
}

export function buildFallbackToolLoopPanelSlot(args: {
  message: UIMessage
  sections: readonly StructuredDebugSection[]
  isStreaming: boolean
}): ConversationToolLoopPanelSlot | null {
  const bubbles = resolveConversationToolResponseBubbles(args.message)
  if (bubbles.length === 0) return null
  const items = conversationToolBubblesToPanelItems(bubbles)
  const live =
    args.isStreaming || bubbles.some((bubble) => toolBubbleLooksInFlight(bubble.part))
  return {
    key: `${args.message.id}-tool-loop-fallback`,
    sectionIndex: lastToolLoopSectionIndex(args.sections),
    items,
    live,
  }
}

export function sectionIndexForToolLoopAnchor(
  sections: readonly StructuredDebugSection[],
  anchorKey: string,
): number {
  const direct = sections.findIndex(
    (section) => section.progressPartKey === anchorKey,
  )
  if (direct >= 0) return direct

  let fallback = -1
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    if (!section || section.sectionKind === 'attachments') continue
    if (
      section.id === 'SkillsToolExecutionStep' ||
      section.progressPartKey
    ) {
      fallback = i
    }
  }
  return fallback
}

export function isToolLoopAnchorComplete(
  anchor: ToolLoopProgressAnchor,
  hasLaterAnchor: boolean,
  isStreaming: boolean,
): boolean {
  if (hasLaterAnchor) return true
  if (anchor.status === 'completed') return true
  return !isStreaming
}

export function resolveConversationToolLoopPanelSlots(args: {
  message: UIMessage
  sections: readonly StructuredDebugSection[]
  stepProgressParts: readonly StepProgressPartInput[]
  frozenItemsByAnchorKey: ReadonlyMap<string, readonly AssistantBubbleDescriptor[]>
  isStreaming: boolean
}): ConversationToolLoopPanelSlot[] {
  const anchors = listToolLoopProgressAnchors(args.stepProgressParts)
  if (anchors.length === 0) {
    const fallback = buildFallbackToolLoopPanelSlot(args)
    return fallback ? [fallback] : []
  }

  const partitioned = partitionToolsByToolLoopBoundaries(args.message, anchors)
  const lastIndex = anchors.length - 1

  const slots = anchors.flatMap((anchor, index) => {
    const isLast = index === lastIndex
    const frozen = args.frozenItemsByAnchorKey.get(anchor.key)
    const liveBubbles = partitioned.get(anchor.key) ?? []
    const items =
      frozen ?? conversationToolBubblesToPanelItems(liveBubbles)
    const live =
      isLast &&
      !frozen &&
      (args.isStreaming ||
        liveBubbles.some((bubble) => toolBubbleLooksInFlight(bubble.part))) &&
      anchor.status !== 'completed'

    if (items.length === 0 && !live) return []

    return [
      {
        key: anchor.key,
        sectionIndex: sectionIndexForToolLoopAnchor(
          args.sections,
          anchor.key,
        ),
        items,
        live,
      },
    ]
  })

  if (slots.length > 0) return slots

  const fallback = buildFallbackToolLoopPanelSlot(args)
  return fallback ? [fallback] : []
}

/** Map conversation tool rows to the shared tool-loop panel item shape. */
export function conversationToolBubblesToPanelItems(
  bubbles: readonly ConversationToolResponseBubble[],
): AssistantBubbleDescriptor[] {
  return bubbles.map((bubble) => ({
    key: bubble.key,
    kind: bubble.viewer === 'terminal' ? 'terminal' : 'tool',
    part: bubble.part,
  }))
}

/** Conversation mode: group agentic-run tool output in the compact sub-panel. */
export function conversationShouldUseToolLoopPanel(
  message: UIMessage,
  sections: readonly StructuredDebugSection[],
): boolean {
  if (messageHasToolLoopAgent(message)) return true
  return sections.some(
    (section) =>
      section.id === 'toolLoop' || section.id === 'SkillsToolExecutionStep',
  )
}

export function viewerPresentation(viewer: ConversationToolResponseViewer): {
  label: string
  icon: string
} {
  switch (viewer) {
    case 'diff':
      return { label: 'Diff', icon: 'i-lucide-file-diff' }
    case 'patch':
      return { label: 'Patch', icon: 'i-lucide-file-patch' }
    case 'file':
      return { label: 'File', icon: 'i-lucide-file-text' }
    case 'terminal':
      return { label: 'Terminal', icon: 'i-lucide-terminal' }
    case 'code':
      return { label: 'Code', icon: 'i-lucide-code-2' }
    case 'todo':
      return { label: 'Todos', icon: 'i-lucide-list-checks' }
    default:
      return { label: 'Result', icon: 'i-lucide-braces' }
  }
}

export function extractFilePreview(part: unknown): {
  path: string
  content: string
} {
  const output = getToolPartOutput(part)
  const record = asOutputRecord(output)
  const input = (() => {
    const raw = (part as { input?: unknown })?.input
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null
  })()

  const path =
    (typeof record?.path === 'string' && record.path.trim()) ||
    (typeof input?.path === 'string' && input.path.trim()) ||
    (typeof input?.file_path === 'string' && input.file_path.trim()) ||
    (typeof input?.target_file === 'string' && input.target_file.trim()) ||
    'file'

  const content =
    (typeof record?.content === 'string' && record.content) ||
    (typeof record?.text === 'string' && record.text) ||
    formatToolOutput(part)

  return { path, content }
}

export function extractPatchPreview(part: unknown): {
  path: string
  patch: string
} {
  const output = getToolPartOutput(part)
  const record = asOutputRecord(output)
  const input = (() => {
    const raw = (part as { input?: unknown })?.input
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null
  })()

  const patch =
    (typeof record?.patch === 'string' && record.patch) ||
    (typeof input?.patch === 'string' && input.patch) ||
    formatToolOutput(part)

  const path =
    (typeof record?.path === 'string' && record.path.trim()) ||
    (typeof input?.path === 'string' && input.path.trim()) ||
    'patch'

  return { path, patch }
}
