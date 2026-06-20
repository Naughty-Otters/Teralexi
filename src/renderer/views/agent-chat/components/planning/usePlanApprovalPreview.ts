import type { TrackedTodo } from '@shared/agent/todos'
import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'

export type PlanApprovalPreviewData = {
  planMarkdown: string
  planFilePath: string
  todosFilePath: string
  todos: TrackedTodo[]
  checklist: string
  agentSummary?: string
}

export function usePlanApprovalPreview(
  enabled: MaybeRefOrGetter<boolean>,
  conversationId: MaybeRefOrGetter<string | null | undefined>,
  agentSummary: MaybeRefOrGetter<string | undefined>,
) {
  const preview = ref<PlanApprovalPreviewData | null>(null)
  const error = ref('')
  const loading = ref(false)

  watch(
    () =>
      [
        toValue(enabled),
        toValue(conversationId),
        toValue(agentSummary),
      ] as const,
    async ([isEnabled, convId, summary]) => {
      preview.value = null
      error.value = ''
      if (!isEnabled || !convId?.trim()) return

      const channel = window.ipcRendererChannel?.PreviewPlanApproval
      if (!channel) {
        error.value = 'Plan preview is unavailable in this environment.'
        return
      }

      loading.value = true
      try {
        const result = await channel.invoke({
          conversationId: convId.trim(),
          agentSummary: summary,
        })
        if (result.ok) {
          preview.value = {
            planMarkdown: result.planMarkdown,
            planFilePath: result.planFilePath,
            todosFilePath: result.todosFilePath,
            todos: result.todos,
            checklist: result.checklist,
            agentSummary: result.agentSummary,
          }
        } else {
          error.value = result.error
        }
      } catch (err) {
        error.value = String(err)
      } finally {
        loading.value = false
      }
    },
    { immediate: true },
  )

  return { preview, error, loading }
}
