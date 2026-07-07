import type { AgentStoreContext } from './agent-store-context'
import type { ConversationSandboxRun } from './types'

export function createSandboxActions(ctx: AgentStoreContext) {
  const {
    currentConversationId,
    conversationSandboxRuns,
    sandboxSelectedRunIdByConversation,
  } = ctx

  function recordSandboxOutput(payload: {
    conversationId: string
    sandboxRoot: string
    resultsFileUrl: string
    outputResultsDir: string
  }) {
    const cid = payload.conversationId
    const prev = conversationSandboxRuns.value[cid] ?? []
    const id = payload.sandboxRoot
    const idx = prev.findIndex((r) => r.id === id)

    const tab: ConversationSandboxRun = {
      id,
      label: idx >= 0 ? prev[idx]!.label : `Run ${prev.length + 1}`,
      resultsFileUrl: payload.resultsFileUrl,
      outputResultsDir: payload.outputResultsDir,
      sandboxRoot: payload.sandboxRoot,
    }

    if (idx >= 0) {
      const next = [...prev]
      next[idx] = tab
      conversationSandboxRuns.value = {
        ...conversationSandboxRuns.value,
        [cid]: next,
      }
    } else {
      conversationSandboxRuns.value = {
        ...conversationSandboxRuns.value,
        [cid]: [...prev, tab],
      }
      sandboxSelectedRunIdByConversation.value = {
        ...sandboxSelectedRunIdByConversation.value,
        [cid]: id,
      }
    }
  }

  function setSelectedSandboxRunId(runId: string) {
    const cid = currentConversationId.value
    if (!cid) return
    sandboxSelectedRunIdByConversation.value = {
      ...sandboxSelectedRunIdByConversation.value,
      [cid]: runId,
    }
  }

  function syncSandboxSelectionForCurrentConversation() {
    const cid = currentConversationId.value
    if (!cid) return
    const runs = conversationSandboxRuns.value[cid] ?? []
    if (!runs.length) return
    const sel = sandboxSelectedRunIdByConversation.value[cid]
    if (!sel || !runs.some((r) => r.id === sel)) {
      sandboxSelectedRunIdByConversation.value = {
        ...sandboxSelectedRunIdByConversation.value,
        [cid]: runs[runs.length - 1].id,
      }
    }
  }

  return {
    recordSandboxOutput,
    setSelectedSandboxRunId,
    syncSandboxSelectionForCurrentConversation,
  }
}
