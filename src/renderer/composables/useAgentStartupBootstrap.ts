import { ref, readonly } from 'vue'
import { useAgentStore } from '@store/agent'
import { useWorkspaceStore } from '@store/workspace'
import { useI18n } from '@renderer/composables/useI18n'

let bootstrapPromise: Promise<void> | null = null

export function useAgentStartupBootstrap() {
  const agentStore = useAgentStore()
  const workspaceStore = useWorkspaceStore()
  const { t } = useI18n()

  const statusMessage = ref<string | null>(null)
  const isRunning = ref(false)
  const isComplete = ref(false)

  function setStatus(message: string | null) {
    statusMessage.value = message
  }

  async function run(onComplete?: () => void): Promise<void> {
    if (bootstrapPromise) {
      await bootstrapPromise
      onComplete?.()
      return
    }

    isRunning.value = true
    bootstrapPromise = (async () => {
      try {
        setStatus(t.value.startup.loadingSettings)
        await agentStore.initializeSettingsFromConfig()

        setStatus(t.value.startup.loadingConversations)
        await agentStore.loadInitialConversations()

        setStatus(t.value.startup.loadingMcp)
        await agentStore.loadMcpServers()

        setStatus(t.value.startup.preparingWorkspace)
        await workspaceStore.loadForConversation(
          agentStore.currentConversationId,
        )

        void agentStore.loadMcpToolsForEnabledServers()
      } finally {
        setStatus(null)
        isRunning.value = false
        isComplete.value = true
      }
    })()

    try {
      await bootstrapPromise
      onComplete?.()
    } catch (error) {
      bootstrapPromise = null
      throw error
    }
  }

  return {
    statusMessage: readonly(statusMessage),
    isRunning: readonly(isRunning),
    isComplete: readonly(isComplete),
    run,
  }
}
