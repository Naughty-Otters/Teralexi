import { ref, readonly } from 'vue'
import { useAgentStore } from '@store/agent'
import { useWorkspaceStore } from '@store/workspace'
import { useI18n } from '@renderer/composables/useI18n'

let criticalBootstrapPromise: Promise<void> | null = null
let deferredBootstrapPromise: Promise<void> | null = null

export function useAgentStartupBootstrap() {
  const agentStore = useAgentStore()
  const workspaceStore = useWorkspaceStore()
  const { t } = useI18n()

  const statusMessage = ref<string | null>(null)
  const isRunning = ref(false)
  const isComplete = ref(false)

  function setBackgroundStatus(message: string | null) {
    statusMessage.value = message
  }

  async function runCriticalStartup(): Promise<void> {
    if (criticalBootstrapPromise) return criticalBootstrapPromise

    criticalBootstrapPromise = (async () => {
      await agentStore.initializeSettingsFromConfig()
      await agentStore.loadInitialConversations()
      isComplete.value = true
    })()

    try {
      await criticalBootstrapPromise
    } catch (error) {
      criticalBootstrapPromise = null
      throw error
    }
  }

  async function runDeferredStartup(): Promise<void> {
    if (deferredBootstrapPromise) return deferredBootstrapPromise

    isRunning.value = true
    deferredBootstrapPromise = (async () => {
      try {
        setBackgroundStatus(t.value.startup.loadingMcp)
        await agentStore.loadMcpServers()

        setBackgroundStatus(t.value.startup.preparingWorkspace)
        await workspaceStore.loadForConversation(
          agentStore.currentConversationId,
        )

        void agentStore.loadMcpToolsForEnabledServers()
      } finally {
        setBackgroundStatus(null)
        isRunning.value = false
      }
    })()

    try {
      await deferredBootstrapPromise
    } catch (error) {
      deferredBootstrapPromise = null
      isRunning.value = false
      setBackgroundStatus(null)
      throw error
    }
  }

  async function run(onComplete?: () => void): Promise<void> {
    await runCriticalStartup()
    onComplete?.()
    void runDeferredStartup()
  }

  return {
    statusMessage: readonly(statusMessage),
    isRunning: readonly(isRunning),
    isComplete: readonly(isComplete),
    run,
  }
}
