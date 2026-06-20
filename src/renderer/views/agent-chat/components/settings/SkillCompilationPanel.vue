<template>
  <div class="scp-root">
    <div v-if="dialog" class="scp-dialog-header">
      <h3 class="scp-dialog-title">{{ p.skills.editCompiledSkill }}</h3>
      <button
        type="button"
        class="scp-btn"
        :disabled="uiBusy"
        @click="emit('close')"
      >
        {{ t.common.close }}
      </button>
    </div>

    <p class="scp-hint">
      <template v-if="editable">
        {{ p.skills.compilationEditableHint }}
      </template>
      <template v-else>
        {{ p.skills.compilationLoadHint }}
      </template>
    </p>

    <div class="scp-toolbar">
      <span class="scp-status" :class="`scp-status--${status}`">
        {{ p.skills.statusPrefix }} {{ statusLabel }}
      </span>
      <span v-if="fingerprint" class="scp-meta" :title="fingerprint">
        {{ p.skills.fingerprintPrefix }} {{ shortFingerprint }}
      </span>
      <span v-if="compiledAt" class="scp-meta">{{ p.skills.compiledPrefix }} {{ compiledAt }}</span>
      <div class="scp-actions">
        <button
          v-if="editable && draft"
          type="button"
          class="scp-btn scp-btn--primary"
          :disabled="uiBusy || !skillId"
          @click="saveEdits"
        >
          {{ saving ? p.skills.saving : p.skills.saveEdits }}
        </button>
        <button
          type="button"
          class="scp-btn scp-btn--primary"
          :disabled="uiBusy || !skillId"
          @click="compile(false)"
        >
          {{ compileButtonLabel(false) }}
        </button>
        <button
          type="button"
          class="scp-btn"
          :disabled="uiBusy || !skillId"
          :title="p.skills.forceRecompileTitle"
          @click="compile(true)"
        >
          {{ compileButtonLabel(true) }}
        </button>
        <button
          type="button"
          class="scp-btn"
          :disabled="uiBusy || !skillId"
          @click="load"
        >
          {{ loading ? p.skills.refreshing : p.actions.refresh }}
        </button>
      </div>
    </div>

    <div v-if="saveError" class="scp-empty scp-empty--error">{{ saveError }}</div>
    <div v-if="loading && !compiling" class="scp-empty">{{ p.skills.loadingStatus }}</div>
    <div v-else-if="loadError" class="scp-empty scp-empty--error">
      {{ loadError }}
    </div>
    <div v-else-if="errorMessage && status === 'failed' && !draft" class="scp-empty scp-empty--error">
      {{ errorMessage }}
    </div>
    <div v-else-if="!draft" class="scp-empty">
      {{ p.skills.noArtifactYet }}
    </div>

    <div v-else class="scp-sections">
      <details open class="scp-section">
        <summary>{{ p.skills.instructionsSection }}</summary>
        <textarea
          v-if="editable"
          v-model="draft.instructions.instructions"
          class="scp-textarea"
          rows="10"
          :disabled="uiBusy"
        />
        <pre v-else class="scp-pre">{{ draft.instructions.instructions }}</pre>
      </details>

      <details open class="scp-section">
        <summary>Validation</summary>
        <p class="scp-subhead">Rules (one per line)</p>
        <textarea
          v-if="editable"
          v-model="validationRulesText"
          class="scp-textarea"
          rows="5"
          :disabled="uiBusy"
        />
        <ul v-else-if="draft.validation.rules.length" class="scp-rules">
          <li v-for="(rule, i) in draft.validation.rules" :key="i">
            {{ rule }}
          </li>
        </ul>
        <p v-else class="scp-muted">No validation rules</p>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

type CompilationStatus = 'pending' | 'ready' | 'failed' | 'missing'

type CompiledArtifactDraft = {
  version: 2
  skillId: string
  sourceFingerprint: string
  thinking: { instructions: string }
  instructions: { instructions: string }
  validation: { rules: string[] }
}

const props = withDefaults(
  defineProps<{
    skillId: string
    editable?: boolean
    dialog?: boolean
  }>(),
  {
    editable: false,
    dialog: false,
  },
)

const emit = defineEmits<{
  saved: []
  close: []
  'busy-change': [busy: boolean]
}>()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const compiling = ref(false)
const saving = ref(false)
const compileMode = ref<'load' | 'force' | null>(null)
const status = ref<CompilationStatus>('missing')
const draft = ref<CompiledArtifactDraft | null>(null)
const errorMessage = ref<string | null>(null)
const fingerprint = ref('')
const compiledAt = ref<string | null>(null)
const validationRulesText = ref('')

const uiBusy = computed(
  () => loading.value || compiling.value || saving.value,
)

const statusLabel = computed(() => {
  if (compiling.value) {
    return compileMode.value === 'force'
      ? p.value.skills.recompiling
      : p.value.skills.compiling
  }
  if (saving.value) return p.value.skills.saving
  if (loading.value) return t.value.common.loading
  switch (status.value) {
    case 'ready':
      return p.value.skills.status.ready
    case 'pending':
      return p.value.skills.status.pending
    case 'failed':
      return p.value.skills.status.failed
    default:
      return p.value.skills.status.notLoaded
  }
})

const shortFingerprint = computed(() => {
  const f = fingerprint.value
  if (f.length <= 16) return f || '—'
  return `${f.slice(0, 8)}…${f.slice(-8)}`
})

function compileButtonLabel(force: boolean): string {
  if (compiling.value && compileMode.value === (force ? 'force' : 'load')) {
    return force ? p.value.skills.recompiling : p.value.skills.compiling
  }
  if (loading.value) {
    return force ? p.value.skills.forceRecompile : p.value.skills.loadCompilation
  }
  return force ? p.value.skills.forceRecompile : p.value.skills.loadCompilation
}

function cloneDraft(compiled: CompiledArtifactDraft): CompiledArtifactDraft {
  return JSON.parse(JSON.stringify(compiled)) as CompiledArtifactDraft
}

function applyDraftFromCompiled(compiled: CompiledArtifactDraft): void {
  draft.value = cloneDraft(compiled)
  validationRulesText.value = compiled.validation.rules.join('\n')
}

function applyCompilationResult(result: {
  status: CompilationStatus
  compiled: CompiledArtifactDraft | null
  errorMessage: string | null
  fingerprint: string
  compiledAt: string | null
}): void {
  status.value = result.status
  errorMessage.value = result.errorMessage
  fingerprint.value = result.fingerprint
  compiledAt.value = result.compiledAt
  if (result.compiled) {
    applyDraftFromCompiled(result.compiled)
  } else {
    draft.value = null
  }
}

function buildArtifactForSave(): CompiledArtifactDraft {
  if (!draft.value) throw new Error('Nothing to save')
  const next = cloneDraft(draft.value)
  next.validation.rules = validationRulesText.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  next.skillId = props.skillId
  next.sourceFingerprint = fingerprint.value
  return next
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  const channel = window.ipcRendererChannel?.GetSkillCompilation
  if (!channel?.invoke) {
    loadError.value = 'Compilation API unavailable'
    loading.value = false
    return
  }
  try {
    const result = await channel.invoke({ skillId: props.skillId })
    applyCompilationResult({
      status: result.status,
      compiled: result.compiled as CompiledArtifactDraft | null,
      errorMessage: result.errorMessage,
      fingerprint: result.fingerprint,
      compiledAt: result.compiledAt,
    })
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function compile(force: boolean): Promise<void> {
  const channel = window.ipcRendererChannel?.CompileSkill
  if (!channel?.invoke) {
    loadError.value = 'CompileSkill API unavailable'
    return
  }
  compiling.value = true
  compileMode.value = force ? 'force' : 'load'
  status.value = 'pending'
  loadError.value = null
  saveError.value = null
  try {
    const result = await channel.invoke({ skillId: props.skillId, force })
    applyCompilationResult({
      status: result.status,
      compiled: result.compiled as CompiledArtifactDraft | null,
      errorMessage: result.errorMessage,
      fingerprint: result.fingerprint,
      compiledAt: result.compiledAt,
    })
    if (result.status === 'ready' && result.compiled) {
      emit('saved')
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    status.value = 'failed'
  } finally {
    compiling.value = false
    compileMode.value = null
  }
}

async function saveEdits(): Promise<void> {
  const channel = window.ipcRendererChannel?.SaveSkillCompilation
  if (!channel?.invoke) {
    saveError.value = 'SaveSkillCompilation API unavailable'
    return
  }
  saving.value = true
  saveError.value = null
  try {
    let compiled: CompiledArtifactDraft
    try {
      compiled = buildArtifactForSave()
    } catch (err) {
      saveError.value = err instanceof Error ? err.message : String(err)
      return
    }
    const result = await channel.invoke({
      skillId: props.skillId,
      compiled,
    })
    if (!result.ok || !result.compiled) {
      saveError.value = result.errorMessage ?? 'Save failed'
      return
    }
    applyCompilationResult({
      status: 'ready',
      compiled: result.compiled as CompiledArtifactDraft,
      errorMessage: null,
      fingerprint: result.fingerprint,
      compiledAt: result.compiledAt,
    })
    emit('saved')
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})

watch(
  () => props.skillId,
  () => {
    void load()
  },
)

watch(
  uiBusy,
  (busy) => {
    emit('busy-change', busy)
  },
  { immediate: true },
)
</script>

<style scoped>
.scp-root {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.scp-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.scp-dialog-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.scp-hint {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-secondary, #666));
  line-height: 1.45;
}

.scp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.scp-status--ready {
  color: var(--color-success, #2e7d32);
}
.scp-status--pending {
  color: var(--color-warning, #ed6c02);
}
.scp-status--failed {
  color: var(--color-error, #c62828);
}

.scp-meta {
  color: var(--ui-text-muted, var(--color-text-secondary, #666));
  font-size: 0.8125rem;
}

.scp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-left: auto;
}

.scp-btn {
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.8125rem;
  border: 1px solid var(--ui-border, #ddd);
  border-radius: 6px;
  background: var(--ui-bg, #fff);
  color: var(--ui-text, inherit);
}

.scp-btn--primary {
  font-weight: 600;
}

.scp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.scp-empty {
  padding: 1rem;
  color: var(--ui-text-muted, var(--color-text-secondary, #666));
}
.scp-empty--error {
  color: var(--color-error, #c62828);
}

.scp-sections {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.scp-section summary {
  cursor: pointer;
  font-weight: 600;
}

.scp-pre {
  white-space: pre-wrap;
  font-size: 0.8125rem;
  max-height: 12rem;
  overflow: auto;
  background: var(--ui-bg-elevated, var(--color-surface-muted, #f5f5f5));
  padding: 0.5rem;
  border-radius: 4px;
}

.scp-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.45;
  padding: 0.5rem;
  border: 1px solid var(--ui-border, #ddd);
  border-radius: 4px;
  background: var(--ui-bg, #fff);
  color: var(--ui-text, inherit);
  resize: vertical;
}

.scp-textarea:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background: var(--ui-bg-elevated, #f5f5f5);
}

.scp-subhead {
  margin: 0.5rem 0 0.25rem;
  font-weight: 500;
}

.scp-rules {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

.scp-muted {
  margin: 0;
  color: var(--ui-text-muted, #666);
  font-size: 0.8125rem;
}
</style>
