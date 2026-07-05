import { computed, type Ref } from 'vue'
import type { Agent } from '@store/agent/types'
import { useSkillSystemPropertyValues } from './useSkillSystemPropertyValues'

export type { SkillSystemPropertyFieldView } from './useSkillSystemPropertyValues'

/** Chat composer: prompt only for missing skill system properties. */
export function useSkillSystemProperties(selectedAgent: Ref<Agent | null>) {
  const specs = computed(() => selectedAgent.value?.systemProperties ?? [])
  const store = useSkillSystemPropertyValues(specs, { mode: 'setup' })

  return {
    loading: store.loading,
    saving: store.saving,
    error: store.error,
    needsSetup: store.needsSetup,
    fields: store.fields,
    canSave: store.canSave,
    setDraft: store.setDraft,
    save: store.saveAllMissing,
    refresh: store.refresh,
  }
}
