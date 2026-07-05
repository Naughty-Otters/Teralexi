import type { Ref } from 'vue'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'
import { useSkillSystemPropertyValues } from './useSkillSystemPropertyValues'

export type { SkillSystemPropertyFieldView as AgentSystemPropertyFieldView } from './useSkillSystemPropertyValues'

/** Agent settings Configurations tab: edit all declared skill system properties. */
export function useAgentSystemPropertiesSettings(
  specs: Ref<readonly SkillSystemPropertySpec[]>,
) {
  const store = useSkillSystemPropertyValues(specs, { mode: 'settings' })

  return {
    loading: store.loading,
    savingKey: store.savingKey,
    error: store.error,
    fields: store.fields,
    valuesByKey: store.valuesByKey,
    setDraft: store.setDraft,
    persist: store.persist,
    refresh: store.refresh,
  }
}
