import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'
import {
  listMissingSkillSystemProperties,
  resolveSkillSystemPropertySpec,
  skillSystemPropertyKeys,
} from '@shared/skills/skill-system-properties'
import {
  expandSkillSystemPropertyFetchKeys,
  normalizeSkillSystemPropertyValues,
  skillSystemPropertiesConfigured,
} from '@shared/skills/skill-system-property-io'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'

export type SkillSystemPropertyFieldView = {
  key: string
  value: string
  spec: SkillSystemPropertySpec
}

export type SkillSystemPropertyValuesMode = 'setup' | 'settings'

type UseSkillSystemPropertyValuesOptions = {
  mode?: SkillSystemPropertyValuesMode
}

/**
 * Single read/write path for skill system properties (chat setup + agent settings).
 * Always loads and saves the keys declared in the skill's properties.md.
 */
export function useSkillSystemPropertyValues(
  specs: Ref<readonly SkillSystemPropertySpec[]> | ComputedRef<readonly SkillSystemPropertySpec[]>,
  options: UseSkillSystemPropertyValuesOptions = {},
) {
  const mode = options.mode ?? 'settings'
  const loading = ref(false)
  const saving = ref(false)
  const savingKey = ref<string | null>(null)
  const error = ref<string | null>(null)
  const valuesByKey = ref<Record<string, string>>({})
  const draftByKey = ref<Record<string, string>>({})

  const propertyKeys = computed(() => skillSystemPropertyKeys(specs.value))

  const missingKeys = computed(() =>
    listMissingSkillSystemProperties(propertyKeys.value, valuesByKey.value),
  )

  const needsSetup = computed(
    () =>
      mode === 'setup' &&
      propertyKeys.value.length > 0 &&
      missingKeys.value.length > 0,
  )

  const fields = computed((): SkillSystemPropertyFieldView[] => {
    const keys =
      mode === 'setup'
        ? missingKeys.value
        : specs.value.map((spec) => spec.key)
    return keys.map((key) => ({
      key,
      value: draftByKey.value[key] ?? valuesByKey.value[key] ?? '',
      spec: resolveSkillSystemPropertySpec(key, specs.value),
    }))
  })

  const canSave = computed(() => {
    if (mode !== 'setup' || !needsSetup.value || saving.value) return false
    return missingKeys.value.every((key) => draftByKey.value[key]?.trim())
  })

  const isConfigured = computed(() =>
    skillSystemPropertiesConfigured(specs.value, valuesByKey.value),
  )

  async function refresh(): Promise<void> {
    const keys = propertyKeys.value
    if (keys.length === 0) {
      valuesByKey.value = {}
      draftByKey.value = {}
      return
    }
    loading.value = true
    error.value = null
    try {
      const loaded = await getSystemConfigValues(
        expandSkillSystemPropertyFetchKeys(specs.value),
      )
      const normalized = normalizeSkillSystemPropertyValues(
        specs.value,
        loaded,
      )
      valuesByKey.value = normalized

      if (mode === 'setup') {
        const nextDraft: Record<string, string> = { ...draftByKey.value }
        for (const key of listMissingSkillSystemProperties(keys, normalized)) {
          if (!(key in nextDraft)) nextDraft[key] = ''
        }
        for (const key of keys) {
          if (normalized[key]) delete nextDraft[key]
        }
        draftByKey.value = nextDraft
        return
      }

      const nextDraft: Record<string, string> = {}
      for (const key of keys) {
        nextDraft[key] = normalized[key] ?? ''
      }
      draftByKey.value = nextDraft
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function setDraft(key: string, value: string): void {
    draftByKey.value = { ...draftByKey.value, [key]: value }
  }

  async function persist(key: string): Promise<boolean> {
    const value = draftByKey.value[key]?.trim() ?? ''
    savingKey.value = key
    saving.value = true
    error.value = null
    try {
      await setSystemConfigValue(key, value)
      valuesByKey.value = { ...valuesByKey.value, [key]: value }
      await refresh()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      savingKey.value = null
      saving.value = false
    }
  }

  async function saveAllMissing(): Promise<boolean> {
    if (!canSave.value) return false
    saving.value = true
    error.value = null
    try {
      for (const key of missingKeys.value) {
        const value = draftByKey.value[key]?.trim() ?? ''
        if (!value) continue
        await setSystemConfigValue(key, value)
        valuesByKey.value = { ...valuesByKey.value, [key]: value }
      }
      await refresh()
      return !needsSetup.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      saving.value = false
    }
  }

  watch(
    () => specs.value.map((spec) => spec.key).join('\0'),
    () => {
      void refresh()
    },
    { immediate: true },
  )

  return {
    loading,
    saving,
    savingKey,
    error,
    needsSetup,
    isConfigured,
    fields,
    canSave,
    valuesByKey,
    setDraft,
    persist,
    saveAllMissing,
    refresh,
  }
}
