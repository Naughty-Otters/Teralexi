import type { WebContents } from 'electron'
import { webContentSend } from '@main/services/web-content-send'
import { logAgentUiError } from '@main/agent/llm/log-llm-error'
import {
  isAgentErrorText,
  isLlmErrorProgressText,
} from '@shared/agent/llm-error-ui'
import type { AgentSandboxReadyPayload, AgentStepProgressPayload, SubAgentRunLifecycleEvent } from './types'

export type AgentStreamBridge = {
  onChunk: (chunk: string) => void
  onUIMessageChunk: (chunk: Record<string, unknown>) => void
  onStepProgress: (progress: AgentStepProgressPayload) => void
  onSubAgentRunEvent: (event: import('./types').SubAgentRunLifecycleEvent) => void
  onSandboxReady: (payload: AgentSandboxReadyPayload) => void
  onSandboxResultWritten: (payload: AgentSandboxReadyPayload) => void
  notifyFinished: () => void
}

export function createAgentStreamBridge(args: {
  webContents?: WebContents
  conversationId: string
  assistantMessageId: string
  onSandboxPersist: (payload: AgentSandboxReadyPayload) => void
}): AgentStreamBridge {
  const { webContents, conversationId, assistantMessageId, onSandboxPersist } =
    args

  const sendIfAlive = (send: () => void) => {
    if (webContents && !webContents.isDestroyed()) send()
  }

  return {
    onChunk: (chunk: string) => {
      sendIfAlive(() =>
        webContentSend.AgentStreamChunk(webContents!, {
          conversationId,
          assistantId: assistantMessageId,
          chunk,
        }),
      )
    },
    onUIMessageChunk: (chunk: Record<string, unknown>) => {
      sendIfAlive(() =>
        webContentSend.AgentUIMessageChunk(webContents!, {
          conversationId,
          assistantId: assistantMessageId,
          chunk,
        }),
      )
    },
    onStepProgress: (progress) => {
      const content = typeof progress.content === 'string' ? progress.content : ''
      const summary =
        typeof progress.summary === 'string' ? progress.summary : ''
      if (
        isLlmErrorProgressText(content) ||
        isLlmErrorProgressText(summary) ||
        isAgentErrorText(content) ||
        isAgentErrorText(summary)
      ) {
        logAgentUiError('Agent LLM error surfaced to UI', {
          conversationId,
          assistantMessageId,
          stepId: progress.stepId,
          stepKey: progress.stepKey,
          title: progress.title,
          content: (content || summary).trim().slice(0, 500),
        })
      }
      sendIfAlive(() =>
        webContentSend.AgentUIMessageChunk(webContents!, {
          conversationId,
          assistantId: assistantMessageId,
          chunk: {
            type: 'data-agent-step-progress',
            id: progress.stepKey,
            data: progress,
          },
        }),
      )
    },
    onSubAgentRunEvent: (event: SubAgentRunLifecycleEvent) => {
      sendIfAlive(() =>
        webContentSend.AgentUIMessageChunk(webContents!, {
          conversationId,
          assistantId: assistantMessageId,
          chunk: {
            type: 'data-sub-agent-run',
            id: `sub-agent-${event.runId}-${event.kind}`,
            data: event,
          },
        }),
      )
    },
    onSandboxReady: (payload) => {
      onSandboxPersist(payload)
      sendIfAlive(() =>
        webContentSend.AgentSandboxOutput(webContents!, {
          conversationId: payload.conversationId,
          sandboxRoot: payload.sandboxRoot,
          outputResultsDir: payload.outputResultsDir,
          resultsFileUrl: payload.resultsFileUrl,
        }),
      )
    },
    onSandboxResultWritten: (payload) => {
      onSandboxPersist(payload)
      sendIfAlive(() =>
        webContentSend.AgentSandboxOutput(webContents!, {
          conversationId: payload.conversationId,
          sandboxRoot: payload.sandboxRoot,
          outputResultsDir: payload.outputResultsDir,
          resultsFileUrl: payload.resultsFileUrl,
        }),
      )
    },
    notifyFinished: () => {
      sendIfAlive(() =>
        webContentSend.AgentStreamFinished(webContents!, {
          conversationId,
          assistantId: assistantMessageId,
        }),
      )
    },
  }
}
