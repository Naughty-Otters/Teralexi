import type { WebContents } from 'electron'
import { getConversationStore } from '@main/services/conversation-store'
import { notifyConversationStoreChanged } from '@main/services/conversation-store-notify'
import { webContentSend } from '@main/services/web-content-send'
import { createLogger } from '@main/logger'
import { isAbortError } from '@shared/utils/abort-error'
import { createAgentStreamBridge } from '@main/agent/agent-stream-bridge'
import {
  loadConversationHistory,
  parseClientUiMessages,
  extractTrailingUserForPersistence,
  extractLastUserForPersistence,
} from '@main/agent/utils'
import { formatLlmErrorForUi, llmErrorFields } from '@main/agent/llm/log-llm-error'
import {
  bindConversationAbortController,
  releaseConversationAbortController,
  type RunAgentForConversationResult,
} from '@main/engine/conversation'
import {
  WORKFLOW_COMPILER_AGENT_ID,
  type WorkflowCompileHints,
} from '@shared/workflows/workflow-studio'
import { compileWorkflowWithTools } from './workflow-compiler-run'
import {
  finalizeWorkflowFromSources,
  resolveWorkflowCompileLlm,
  resolveCompilerSystemPrompt,
  type WorkflowCompileResponse,
} from './workflow-compiler'
import { WORKFLOW_COMPILER_TOOL_NAMES } from './workflow-source-scope'

const log = createLogger('workflows.compiler-agent')

export type RunWorkflowCompilerAgentArgs = {
  conversationId: string
  workflowId: string
  assistantMessageId: string
  userId: string
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
  webContents?: WebContents
  baseVersionId?: string
  compileHints?: WorkflowCompileHints
}

export type RunWorkflowCompilerAgentResult = RunAgentForConversationResult & {
  compileResult?: WorkflowCompileResponse
}

function resolveTurnUserContent(args: {
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
}): string | null {
  const parsed = parseClientUiMessages(args.uiMessages)
  const fromUi =
    extractTrailingUserForPersistence(parsed) ??
    extractLastUserForPersistence(parsed)
  if (fromUi?.content.trim()) return fromUi.content.trim()
  const pending = args.pendingUserMessage
  if (
    pending &&
    typeof pending.content === 'string' &&
    pending.content.trim().length > 0
  ) {
    return pending.content.trim()
  }
  return null
}

function persistIncomingUserMessage(args: {
  conversationId: string
  agentId: string
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
}): void {
  const parsed = parseClientUiMessages(args.uiMessages)
  const fromUi =
    extractTrailingUserForPersistence(parsed) ??
    extractLastUserForPersistence(parsed)
  const pending = args.pendingUserMessage
  const pendingOk =
    pending &&
    typeof pending.id === 'string' &&
    pending.id.trim().length > 0 &&
    typeof pending.content === 'string' &&
    pending.content.trim().length > 0 &&
    typeof pending.createdAt === 'string'

  const row = fromUi
    ? fromUi
    : pendingOk && pending
      ? {
          id: pending.id.trim(),
          content: pending.content.trim(),
          createdAt: pending.createdAt,
        }
      : null
  if (!row) return

  try {
    getConversationStore().saveMessage({
      id: row.id,
      conversationId: args.conversationId,
      agentId: args.agentId,
      role: 'user',
      content: row.content,
      createdAt: row.createdAt,
    })
  } catch (err) {
    log.warn('Failed to persist workflow compile user message', {
      conversationId: args.conversationId,
      err,
    })
  }
}

function ensureWorkflowStudioConversation(args: {
  conversationId: string
  workflowId: string
  workflowName: string
}): void {
  const store = getConversationStore()
  const existing = store.getConversation(args.conversationId)
  if (!existing) {
    const now = new Date().toISOString()
    store.createConversation({
      id: args.conversationId,
      agentId: WORKFLOW_COMPILER_AGENT_ID,
      title: `Workflow: ${args.workflowName}`,
      createdAt: now,
      updatedAt: now,
    })
  } else if (existing.agentId !== WORKFLOW_COMPILER_AGENT_ID) {
    store.updateConversationAgent(args.conversationId, WORKFLOW_COMPILER_AGENT_ID)
  }
  store.touchConversation(args.conversationId)
}

function buildCompileHintsAppendix(hints?: WorkflowCompileHints): string {
  if (!hints) return ''
  const parts: string[] = []
  if (hints.mermaidError?.trim()) {
    parts.push(`Previous Mermaid render error: ${hints.mermaidError.trim()}`)
  }
  if (hints.entityErrors?.length) {
    parts.push('Previous entities.md errors:')
    parts.push(...hints.entityErrors.map((e) => `- ${e}`))
  }
  if (hints.validationErrors?.length) {
    parts.push('Previous compile validation errors:')
    parts.push(...hints.validationErrors.map((e) => `- ${e}`))
  }
  return parts.length > 0 ? `\n\n${parts.join('\n')}` : ''
}

function notifyRendererConversationChanged(
  conversationId: string,
  webContents?: WebContents,
): void {
  if (webContents && !webContents.isDestroyed()) {
    webContentSend.ConversationStoreChanged(webContents, {
      conversationId,
      agentId: WORKFLOW_COMPILER_AGENT_ID,
    })
    return
  }
  notifyConversationStoreChanged(conversationId, WORKFLOW_COMPILER_AGENT_ID)
}

export async function runWorkflowCompilerAgent(
  args: RunWorkflowCompilerAgentArgs,
): Promise<RunWorkflowCompilerAgentResult> {
  try {
    return await executeWorkflowCompilerAgent(args)
  } catch (err: unknown) {
    if (isAbortError(err)) {
      return { finalContent: '', hasError: false }
    }
    const errorMessage = formatLlmErrorForUi(err)
    log.error('Workflow compiler agent crashed', {
      conversationId: args.conversationId,
      workflowId: args.workflowId,
      errorMessage,
      ...llmErrorFields(err),
    })
    return { finalContent: '', hasError: true, errorMessage }
  }
}

async function executeWorkflowCompilerAgent(
  args: RunWorkflowCompilerAgentArgs,
): Promise<RunWorkflowCompilerAgentResult> {
  const {
    conversationId,
    workflowId,
    assistantMessageId,
    userId,
    uiMessages,
    pendingUserMessage,
    webContents,
    baseVersionId,
    compileHints,
  } = args

  const store = getConversationStore()
  const workflow = store.getWorkflow(workflowId)
  if (!workflow || workflow.userId !== userId) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: 'Workflow not found',
    }
  }

  ensureWorkflowStudioConversation({
    conversationId,
    workflowId,
    workflowName: workflow.name,
  })

  persistIncomingUserMessage({
    conversationId,
    agentId: WORKFLOW_COMPILER_AGENT_ID,
    uiMessages,
    pendingUserMessage,
  })

  const turnUserContent = resolveTurnUserContent({ uiMessages, pendingUserMessage })
  if (!turnUserContent) {
    return {
      finalContent: '',
      hasError: true,
      errorMessage: 'User message is required',
    }
  }

  const seedVersion = workflow.currentVersionId
    ? store.getWorkflowVersion(workflow.currentVersionId)
    : store.listWorkflowVersions(workflowId)[0] ?? null

  const abortController = bindConversationAbortController(conversationId)
  const streamBridge = createAgentStreamBridge({
    webContents,
    conversationId,
    assistantMessageId,
    onSandboxPersist: () => {},
  })

  let finalContent = ''
  let hasError = false
  let errorMessage: string | undefined
  let compileResult: WorkflowCompileResponse | undefined

  try {
    const compileLlm = resolveWorkflowCompileLlm()
    const systemPrompt = await resolveCompilerSystemPrompt()
    const history = loadConversationHistory(conversationId, assistantMessageId)
    const trimmedHistory =
      history.length > 0 && history[history.length - 1]?.role === 'user'
        ? history.slice(0, -1)
        : history
    const userPrompt =
      turnUserContent + buildCompileHintsAppendix(compileHints)

    const compileRun = await compileWorkflowWithTools({
      workflowId,
      workflowName: workflow.name,
      userId,
      systemPrompt,
      userPrompt,
      provider: compileLlm.provider,
      model: compileLlm.model,
      knownTools: new Set(WORKFLOW_COMPILER_TOOL_NAMES),
      conversationId,
      history: trimmedHistory,
      abortSignal: abortController.signal,
      onChunk: streamBridge.onChunk,
      onUIMessageChunk: streamBridge.onUIMessageChunk,
      seedVersion,
    })

    finalContent = compileRun.assistantText

    compileResult = await finalizeWorkflowFromSources({
      userId,
      workflowId,
      baseVersionId,
      prompt: userPrompt,
      assistantText: compileRun.assistantText,
    })
  } catch (err: unknown) {
    if (isAbortError(err)) {
      log.info('Workflow compiler agent aborted', { conversationId, workflowId })
      return { finalContent: '', hasError: false }
    }
    hasError = true
    errorMessage = formatLlmErrorForUi(err)
    log.error('Workflow compiler agent failed', {
      conversationId,
      workflowId,
      errorMessage,
      ...llmErrorFields(err),
    })
  } finally {
    releaseConversationAbortController(conversationId)
  }

  if (!hasError && finalContent.trim()) {
    try {
      getConversationStore().saveMessage({
        id: assistantMessageId,
        conversationId,
        agentId: WORKFLOW_COMPILER_AGENT_ID,
        role: 'assistant',
        content: finalContent,
        createdAt: new Date().toISOString(),
      })
      notifyRendererConversationChanged(conversationId, webContents)
    } catch (err) {
      log.warn('Failed to persist workflow compile assistant message', {
        conversationId,
        assistantMessageId,
        err,
      })
    }
  }

  streamBridge.notifyFinished()

  return {
    finalContent,
    hasError,
    errorMessage,
    compileResult,
  }
}
