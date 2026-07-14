<template>
  <div class="acp-layout">
    <!-- Left sidebar: agent list -->
    <aside class="acp-sidebar">
      <button
        class="acp-tab acp-tab--add"
        :class="{ 'acp-tab--active': selectedId === '__new__' }"
        @click="selectedId = '__new__'"
      >
        <span class="acp-tab-plus">+</span>
        <span class="acp-tab-name">Add Agent</span>
      </button>

      <template
        v-for="(entry, index) in settingsSidebarEntries"
        :key="sidebarEntryKey(entry, index)"
      >
        <div
          v-if="entry.kind === 'header'"
          class="acp-group-header"
        >
          {{ entry.label }}
        </div>
        <button
          v-else
          class="acp-tab"
          :class="{
            'acp-tab--active': selectedId === entry.agent.id,
            'acp-tab--disabled': !entry.agent.enabled,
            'acp-tab--grouped': entry.grouped,
          }"
          @click="selectedId = entry.agent.id"
        >
          <UAvatar :alt="entry.label" :color="entry.agent.color" size="xs" />
          <span class="acp-tab-name">{{ entry.label }}</span>
          <span
            v-if="isWorkflowPanelAgentId(entry.agent.id)"
            class="acp-tab-badge"
          >
            {{ p.agents.workflowBadge }}
          </span>
        </button>
      </template>
    </aside>

    <!-- Right pane: add form -->
    <section v-if="selectedId === '__new__'" class="acp-content sp-section">
      <div class="sp-section-title-row">
        <span class="sp-section-title">{{ t.settings.sections.newAgent }}</span>
      </div>

      <AgentFormTabs
        class="acp-form-tabs"
        v-model="newAgent"
        agent-id="__new__"
        :available-models="
          agentStore.availableModelsByProvider[newAgent.provider] ?? []
        "
      />

      <div class="sp-form-actions">
        <button
          class="sp-action-btn sp-action-btn--confirm"
          :disabled="!newAgent.name.trim()"
          @click="submitAddAgent"
        >
          Add Agent
        </button>
      </div>
    </section>

    <!-- Right pane: selected agent settings -->
    <section v-else-if="selectedAgent" class="acp-content sp-section">
      <div class="sp-section-title-row">
        <span class="sp-section-title">{{
          formatAgentGroupDisplayName(selectedAgent)
        }}</span>
        <label
          class="sp-toggle"
          :title="selectedAgent.enabled ? 'Disable agent' : 'Enable agent'"
        >
          <input
            type="checkbox"
            :checked="selectedAgent.enabled"
            @change="agentStore.toggleAgentEnabled(selectedAgent!.id)"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': selectedAgent.enabled }"
          />
        </label>
      </div>

      <AgentFormTabs
        class="acp-form-tabs"
        :model-value="agentFormData"
        :agent-id="selectedAgent.id"
        :system-properties="selectedAgent.systemProperties ?? []"
        :available-models="
          agentStore.availableModelsByProvider[
            selectedAgent.provider ?? 'ollama'
          ] ?? []
        "
        :disabled="!selectedAgent.enabled"
        :reset-key="selectedAgent.id"
        :skill-id="resolveAgentSkillId(selectedAgent)"
        @update:model-value="onAgentFormUpdate"
      />

      <div class="sp-form-actions">
        <button
          class="sp-action-btn sp-action-btn--delete"
          :disabled="!selectedAgent.id.startsWith('custom:')"
          @click="removeSelected"
        >
          Delete Agent
        </button>
      </div>
    </section>

    <!-- Empty state -->
    <section v-else class="acp-content acp-empty">
      <span>Select an agent to configure it, or add a new one.</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore } from '@store/agent'
import type { ProviderType, Agent } from '@store/agent'
import { DEFAULT_TOOL_LOOP_MAX_ITERATIONS, DEFAULT_TODO_MAX_RETRIES } from '@shared/agent/tool-loop'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import {
  agentPickerRowLabel,
  buildAgentPickerEntries,
  formatAgentGroupDisplayName,
  type AgentPickerEntry,
} from '@shared/agent/skill-groups'
import AgentFormTabs from './AgentFormTabs.vue'
import type { AgentFormData } from './AgentFormTabs.vue'

const { t, p } = useI18n()
const agentStore = useAgentStore()

// '__new__' = add form, agent id = edit that agent
const selectedId = ref<string | null>(
  agentStore.agents.length > 0 ? agentStore.agents[0].id : '__new__',
)

const selectedAgent = computed(() =>
  selectedId.value && selectedId.value !== '__new__'
    ? (agentStore.agents.find((a) => a.id === selectedId.value) ?? null)
    : null,
)

type SettingsSidebarEntry =
  | { kind: 'header'; groupId: string; label: string }
  | { kind: 'agent'; agent: Agent; label: string; grouped: boolean }

const settingsSidebarEntries = computed((): SettingsSidebarEntry[] => {
  const pickerEntries = buildAgentPickerEntries(agentStore.agents)
  const out: SettingsSidebarEntry[] = []

  for (let index = 0; index < pickerEntries.length; index += 1) {
    const entry: AgentPickerEntry = pickerEntries[index]!
    if (entry.kind === 'header') {
      out.push({
        kind: 'header',
        groupId: entry.groupId,
        label: entry.label,
      })
      continue
    }

    const agent = agentStore.agents.find((item) => item.id === entry.option.id)
    if (!agent) continue

    const prev = pickerEntries[index - 1]
    const grouped = prev?.kind === 'header'

    out.push({
      kind: 'agent',
      agent,
      label: agentPickerRowLabel(entry.option, grouped),
      grouped,
    })
  }

  return out
})

function sidebarEntryKey(entry: SettingsSidebarEntry, index: number): string {
  if (entry.kind === 'header') return `header:${entry.groupId}:${index}`
  return entry.agent.id
}

/** Skill folder name for skill-backed agents (`skill:<id>` or `skillId`). */
function resolveAgentSkillId(agent: Agent): string | null {
  if (agent.skillId?.trim()) return agent.skillId.trim()
  if (agent.id.startsWith('skill:')) return agent.id.slice('skill:'.length)
  return null
}

// Map selected agent → AgentFormData shape for AgentFormTabs
const agentFormData = computed<AgentFormData>(() => {
  const a = selectedAgent.value!
  return {
    name: a.name ?? '',
    description: a.description ?? '',
    provider: (a.provider ?? 'ollama') as ProviderType,
    model: a.model ?? '',
    color: (a.color ?? 'primary') as AgentFormData['color'],
    skillsPrompt: a.skillsPrompt ?? '',
    availableSkillTools: (a.availableSkillTools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      tags: tool.tags,
      needsApproval: tool.needsApproval,
    })),
    availableSet: [...(a.availableSet ?? [])],
    availableSetTouched: a.availableSetTouched ?? false,
    toolNeedsApprovalOverrides: { ...(a.toolNeedsApprovalOverrides ?? {}) },
    availableMcpServers: a.availableMcpServers ?? null,
    toolLoopMaxIterations:
      a.toolLoopMaxIterations ??
      a.executionSteps?.toolLoop?.maxIterations ??
      DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
    todoMaxRetries: a.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
    allowAsSubAgent: a.allowAsSubAgent !== false,
    allowSubAgents: a.allowSubAgents !== false,
    subAgentIds: [...(a.subAgentIds ?? [])],
    llmRoutingMode: a.llmRoutingMode ?? 'unified',
    stageLlm: { ...(a.stageLlm ?? {}) },
    defaultProviderOptions: a.defaultProviderOptions
      ? { ...a.defaultProviderOptions }
      : undefined,
  }
})

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((item) => set.has(item))
}

function sameStringSetNullable(
  left: string[] | null,
  right: string[] | null,
): boolean {
  if (left === null && right === null) return true
  if (left === null || right === null) return false
  return sameStringSet(left, right)
}

function sameBooleanRecord(
  left: Record<string, boolean>,
  right: Record<string, boolean>,
): boolean {
  const lk = Object.keys(left).sort()
  const rk = Object.keys(right).sort()
  if (lk.length !== rk.length) return false
  for (let i = 0; i < lk.length; i++) {
    if (lk[i] !== rk[i]) return false
  }
  for (const k of lk) {
    if (left[k] !== right[k]) return false
  }
  return true
}

// Diff and call only changed store updaters when the form emits an update
function onAgentFormUpdate(next: AgentFormData) {
  const id = selectedAgent.value!.id
  const prev = agentFormData.value
  if (next.name !== prev.name) agentStore.updateAgentName(id, next.name)
  if (next.description !== prev.description)
    agentStore.updateAgentDescription(id, next.description)
  if (next.provider !== prev.provider)
    agentStore.updateAgentProvider(id, next.provider)
  if (next.model !== prev.model) agentStore.updateAgentModel(id, next.model)
  if (next.color !== prev.color)
    agentStore.updateAgentColor(id, next.color as Agent['color'])
  if (next.skillsPrompt !== prev.skillsPrompt)
    agentStore.updateAgentSkillsPrompt(id, next.skillsPrompt)
  if (!sameStringSet(next.availableSet ?? [], prev.availableSet ?? []))
    agentStore.updateAgentAvailableSet(id, next.availableSet ?? [])
  if (next.availableSetTouched !== prev.availableSetTouched)
    agentStore.updateAgentAvailableSetTouched(id, next.availableSetTouched)
  if (
    !sameBooleanRecord(
      next.toolNeedsApprovalOverrides ?? {},
      prev.toolNeedsApprovalOverrides ?? {},
    )
  )
    agentStore.updateAgentToolNeedsApprovalOverrides(
      id,
      next.toolNeedsApprovalOverrides ?? {},
    )
  if (
    !sameStringSetNullable(next.availableMcpServers, prev.availableMcpServers)
  )
    agentStore.updateAgentAvailableMcpServers(id, next.availableMcpServers)
  if (next.toolLoopMaxIterations !== prev.toolLoopMaxIterations)
    agentStore.updateAgentToolLoopMaxIterations(id, next.toolLoopMaxIterations)
  if (next.todoMaxRetries !== prev.todoMaxRetries)
    agentStore.updateAgentTodoMaxRetries(id, next.todoMaxRetries)
  if (next.allowAsSubAgent !== prev.allowAsSubAgent)
    agentStore.updateAgentAllowAsSubAgent(id, next.allowAsSubAgent)
  if (
    next.allowSubAgents !== prev.allowSubAgents ||
    !sameStringSet(next.subAgentIds ?? [], prev.subAgentIds ?? [])
  ) {
    agentStore.updateAgentSubAgentDelegation(
      id,
      next.allowSubAgents,
      next.subAgentIds.length > 0 ? next.subAgentIds : null,
    )
  }
  if (next.llmRoutingMode !== prev.llmRoutingMode)
    agentStore.updateAgentLlmRoutingMode(id, next.llmRoutingMode)
  if (JSON.stringify(next.stageLlm) !== JSON.stringify(prev.stageLlm))
    agentStore.updateAgentStageLlm(id, next.stageLlm)
  if (
    JSON.stringify(next.defaultProviderOptions ?? null) !==
    JSON.stringify(prev.defaultProviderOptions ?? null)
  ) {
    agentStore.updateAgentDefaultProviderOptions(
      id,
      next.defaultProviderOptions,
    )
  }
}

function removeSelected() {
  if (!selectedAgent.value) return
  const idx = agentStore.agents.findIndex(
    (a) => a.id === selectedAgent.value!.id,
  )
  agentStore.removeAgent(selectedAgent.value.id)
  const next = agentStore.agents[idx] ?? agentStore.agents[idx - 1]
  selectedId.value = next ? next.id : '__new__'
}

const newAgent = ref<AgentFormData>({
  name: '',
  description: '',
  model: '',
  color: 'primary',
  skillsPrompt: '',
  availableSkillTools: [],
  availableSet: [],
  availableSetTouched: false,
  toolNeedsApprovalOverrides: {},
  availableMcpServers: null,
  toolLoopMaxIterations: DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
  todoMaxRetries: DEFAULT_TODO_MAX_RETRIES,
  allowAsSubAgent: true,
  allowSubAgents: true,
  subAgentIds: [],
  provider: 'ollama',
  llmRoutingMode: 'unified',
  stageLlm: {},
  defaultProviderOptions: undefined,
})

function submitAddAgent() {
  if (!newAgent.value.name.trim()) return
  agentStore.addAgent({ ...newAgent.value, systemPrompt: '', enabled: true })
  const added = agentStore.agents[agentStore.agents.length - 1]
  selectedId.value = added ? added.id : null
  newAgent.value = {
    name: '',
    description: '',
    model: '',
    color: 'primary',
    skillsPrompt: '',
    availableSkillTools: [],
    availableSet: [],
    toolNeedsApprovalOverrides: {},
    availableMcpServers: null,
    toolLoopMaxIterations: DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
    todoMaxRetries: DEFAULT_TODO_MAX_RETRIES,
    allowAsSubAgent: true,
    allowSubAgents: true,
    subAgentIds: [],
    provider: 'ollama',
    llmRoutingMode: 'unified',
    stageLlm: {},
    defaultProviderOptions: undefined,
  }
}
</script>

<style scoped>
@import './sp-shared.css';

/* ── Two-pane layout ── */
.acp-layout {
  display: flex;
  align-items: flex-start;
  gap: 0;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
}

.acp-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
}

.acp-tab-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-primary-700);
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary-500) 35%, transparent);
}

:global(html.dark .acp-tab-badge) {
  color: var(--color-primary-300);
}

.acp-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--ui-text);
  transition: background 0.12s;
  width: 100%;
}

.acp-tab:hover {
  background: var(--ui-bg-accented);
}

.acp-tab--disabled {
  opacity: 0.5;
}

.acp-group-header {
  padding: 10px 10px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.acp-tab--grouped {
  padding-left: 18px;
}

.acp-tab--add {
  margin-bottom: 6px;
  border-bottom: 1px solid var(--ui-border);
  border-radius: 0;
  color: var(--ui-text-muted);
  padding-bottom: 9px;
}

.acp-tab-plus {
  font-size: 16px;
  line-height: 1;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.acp-tab-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.acp-content {
  flex: 1;
  min-width: 0;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.acp-form-tabs {
  flex: 1;
  min-height: 0;
}

.sp-action-btn--delete {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 14%,
    transparent
  );
  color: var(--color-error-700, #b91c1c);
  border-color: var(--color-error-500, #ef4444);
}

.sp-action-btn--delete:hover {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 24%,
    transparent
  );
}

.sp-action-btn--delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

:global(html.dark .sp-action-btn--delete) {
  color: var(--color-error-300, #fca5a5);
  border-color: var(--color-error-400, #f87171);
}

.acp-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.sp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.sp-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
}

.sp-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border);
  flex-shrink: 0;
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sp-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sp-input {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.sp-input:focus {
  border-color: var(--color-primary-500);
}

.sp-textarea {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  resize: vertical;
  line-height: 1.55;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.sp-textarea:focus {
  border-color: var(--color-primary-500);
}

.sp-select {
  appearance: auto;
  cursor: pointer;
}

.sp-agent-card {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sp-agent-card--disabled {
  opacity: 0.55;
}

.sp-agent-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ui-border);
}

.sp-agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.sp-agent-desc {
  font-size: 12px;
  color: var(--ui-text-muted);
  margin-left: auto;
}

.sp-agent-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-remove-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.12s,
    color 0.12s;
}

.sp-remove-btn:hover {
  background: color-mix(in srgb, var(--color-error-500) 12%, transparent);
  color: var(--color-error-500);
}

.sp-ghost-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
  border: 1.5px solid;
  white-space: nowrap;
}

.sp-ghost-btn--primary {
  color: var(--color-primary-500);
  border-color: var(--color-primary-500);
  background: transparent;
}

.sp-ghost-btn--primary:hover {
  background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
}

.sp-ghost-btn--neutral {
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
  background: transparent;
}

.sp-ghost-btn--neutral:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  border-color: var(--ui-text-muted);
}

.sp-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  margin-top: 8px;
  flex-shrink: 0;
}

.sp-action-btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    opacity 0.12s,
    border-color 0.12s;
  border: 1.5px solid;
}

.sp-action-btn--cancel {
  background: transparent;
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
}

.sp-action-btn--cancel:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
  border-color: var(--ui-text-muted);
}

.sp-action-btn--confirm {
  background: color-mix(in srgb, var(--color-primary-500) 14%, transparent);
  color: var(--color-primary-700);
  border-color: var(--color-primary-500);
}

.sp-action-btn--confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary-500) 24%, transparent);
}

.sp-action-btn--confirm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

:global(html.dark .sp-action-btn--confirm) {
  color: var(--color-primary-300);
  border-color: var(--color-primary-400);
}
</style>
