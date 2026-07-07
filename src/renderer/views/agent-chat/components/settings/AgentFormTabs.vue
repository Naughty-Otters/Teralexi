<template>
  <div class="aft-root">
    <!-- Inner tabs -->
    <div class="aft-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="aft-tab"
        :class="{ 'aft-tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- General tab -->
    <div
      v-if="activeTab === 'general'"
      class="aft-card"
      :class="{ 'aft-card--disabled': disabled }"
    >
      <div class="aft-field">
        <label class="aft-label">{{ p.fields.name }}</label>
        <input
          class="aft-input"
          :value="modelValue.name"
          :placeholder="p.agents.namePlaceholder"
          @input="
            emit('update:modelValue', {
              ...modelValue,
              name: ($event.target as HTMLInputElement).value,
            })
          "
        />
      </div>
      <div class="aft-field">
        <label class="aft-label">{{ p.fields.description }}</label>
        <input
          class="aft-input"
          :value="modelValue.description"
          :placeholder="p.agents.descriptionPlaceholder"
          @input="
            emit('update:modelValue', {
              ...modelValue,
              description: ($event.target as HTMLInputElement).value,
            })
          "
        />
      </div>
      <div class="aft-field aft-field--routing">
        <label class="aft-label">{{ p.agents.llmRouting }}</label>
        <div class="aft-routing-toggle">
          <label class="aft-routing-option">
            <input
              type="radio"
              name="llm-routing"
              value="unified"
              :checked="modelValue.llmRoutingMode === 'unified'"
              :disabled="disabled"
              @change="setLlmRoutingMode('unified')"
            />
            <span>{{ p.agents.oneProvider }}</span>
          </label>
          <label class="aft-routing-option">
            <input
              type="radio"
              name="llm-routing"
              value="per_stage"
              :checked="modelValue.llmRoutingMode === 'per_stage'"
              :disabled="disabled"
              @change="setLlmRoutingMode('per_stage')"
            />
            <span>{{ p.agents.perStage }}</span>
          </label>
        </div>
      </div>
      <template v-if="modelValue.llmRoutingMode === 'unified'">
        <div class="aft-field">
          <label class="aft-label">{{ p.fields.provider }}</label>
          <LlmProviderSelect
            :model-value="modelValue.provider"
            :disabled="disabled"
            @update:model-value="onProviderChange"
          />
        </div>
        <div class="aft-field">
          <label class="aft-label">{{ p.fields.model }}</label>
          <LlmModelSelect
            v-if="(availableModels ?? []).length > 0"
            :model-value="modelValue.model"
            :models="availableModels ?? []"
            :disabled="disabled"
            @update:model-value="
              emit('update:modelValue', { ...modelValue, model: $event })
            "
          />
          <input
            v-else
            class="aft-input"
            :value="modelValue.model"
            placeholder="e.g. llama3.2"
            @input="
              emit('update:modelValue', {
                ...modelValue,
                model: ($event.target as HTMLInputElement).value,
              })
            "
          />
        </div>
      </template>
      <div
        v-else
        class="aft-field aft-stage-llm-block"
      >
        <label class="aft-label">{{ p.agents.stageLlms }}</label>
        <p class="aft-hint">
          {{ p.agents.stageLlmsHint }}
        </p>
        <div class="aft-stage-llm-rows">
          <AgentLlmStagePicker
            v-for="stage in agentLlmStages"
            :key="stage"
            :label="agentLlmStageLabels[stage]"
            :choice="stageChoice(stage)"
            :disabled="disabled"
            @update:choice="(choice) => updateStageLlm(stage, choice)"
          />
        </div>
      </div>
      <div class="aft-field">
        <label class="aft-label">{{ p.agents.toolLoopMax }}</label>
        <input
          class="aft-input"
          type="number"
          :min="toolLoopMin"
          :max="toolLoopMax"
          :value="modelValue.toolLoopMaxIterations"
          :disabled="disabled"
          @input="onToolLoopMaxIterationsInput"
        />
        <p class="aft-hint">
          {{
            p.agents.toolLoopMaxHint
              .replace('{min}', String(toolLoopMin))
              .replace('{max}', String(toolLoopMax))
          }}
        </p>
      </div>
      <div class="aft-field">
        <label class="aft-label">{{ p.agents.todoRetries }}</label>
        <input
          class="aft-input"
          type="number"
          :min="todoRetryMin"
          :max="todoRetryMax"
          :value="modelValue.todoMaxRetries"
          :disabled="disabled"
          @input="onTodoMaxRetriesInput"
        />
        <p class="aft-hint">
          {{
            p.agents.todoRetriesHint
              .replace('{min}', String(todoRetryMin))
              .replace('{max}', String(todoRetryMax))
          }}
        </p>
      </div>
      <div class="aft-field">
        <label class="aft-label">{{ p.agents.failureRecovery }}</label>
        <p class="aft-hint">
          {{ p.agents.failureRecoveryHint }}
        </p>
        <label class="aft-routing-option">
          <input
            type="radio"
            name="failure-recovery-llm"
            value="inherit"
            :checked="!hasRecoveryOverride"
            :disabled="disabled"
            @change="setRecoveryInherit(true)"
          />
          <span>{{ p.agents.sameAsToolLoop }}</span>
        </label>
        <label class="aft-routing-option">
          <input
            type="radio"
            name="failure-recovery-llm"
            value="custom"
            :checked="hasRecoveryOverride"
            :disabled="disabled"
            @change="setRecoveryInherit(false)"
          />
          <span>{{ p.agents.customRecovery }}</span>
        </label>
        <AgentLlmStagePicker
          v-if="hasRecoveryOverride"
          class="aft-recovery-llm-picker"
          :label="agentLlmStageLabels.toolLoopRecovery"
          :choice="recoveryChoice"
          :disabled="disabled"
          @update:choice="updateRecoveryLlm"
        />
      </div>
      <div class="aft-field">
        <label class="aft-label">{{ p.agents.color }}</label>
        <select
          class="aft-input aft-select"
          :value="modelValue.color"
          @change="
            emit('update:modelValue', {
              ...modelValue,
              color: ($event.target as HTMLSelectElement).value as AgentColor,
            })
          "
        >
          <option value="primary">{{ p.agents.colors.primary }}</option>
          <option value="secondary">{{ p.agents.colors.secondary }}</option>
          <option value="success">{{ p.agents.colors.success }}</option>
          <option value="info">{{ p.agents.colors.info }}</option>
          <option value="warning">{{ p.agents.colors.warning }}</option>
          <option value="error">{{ p.agents.colors.error }}</option>
          <option value="neutral">{{ p.agents.colors.neutral }}</option>
        </select>
      </div>
    </div>

    <!-- Configurations tab (skill system properties + skill-specific setup) -->
    <AgentConfigurationsTab
      v-else-if="activeTab === 'configurations'"
      :system-properties="systemProperties"
      :skill-id="effectiveSkillId"
      :disabled="disabled"
    />

    <!-- ToolSet tab -->
    <div
      v-else-if="activeTab === 'toolset'"
      class="aft-card"
      :class="{ 'aft-card--disabled': disabled }"
    >
      <div class="aft-field">
        <label class="aft-label">{{ p.agents.availableSet }}</label>
        <p class="aft-hint">
          {{ p.agents.availableSetHint }}
        </p>
        <AvailableSetCards
          v-model="availableSetProxy"
          v-model:available-set-touched="availableSetTouchedProxy"
          v-model:approval-overrides="approvalOverridesProxy"
          :tools="modelValue.availableSkillTools"
          :disabled="disabled"
        />
      </div>
    </div>

    <!-- Sub-agents tab -->
    <div
      v-else-if="activeTab === 'subagents'"
      class="aft-card"
      :class="{ 'aft-card--disabled': disabled }"
    >
      <div class="aft-subagent-row">
        <div class="aft-subagent-row-text">
          <span class="aft-label">{{ p.agents.availableAsSubAgent }}</span>
          <p class="aft-hint">
            {{ p.agents.availableAsSubAgentHint }}
          </p>
        </div>
        <label
          class="sp-toggle"
          :title="
            modelValue.allowAsSubAgent
              ? p.agents.disableSubAgent
              : p.agents.enableSubAgent
          "
        >
          <input
            type="checkbox"
            :checked="modelValue.allowAsSubAgent"
            :disabled="disabled"
            @change="onAllowAsSubAgentChange"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': modelValue.allowAsSubAgent }"
          />
        </label>
      </div>

      <div class="aft-subagent-row aft-subagent-row--divider">
        <div class="aft-subagent-row-text">
          <span class="aft-label">{{ p.agents.delegateToolLoop }}</span>
          <p class="aft-hint">
            {{ p.agents.delegateToolLoopHint }}
          </p>
        </div>
        <label
          class="sp-toggle"
          :title="
            modelValue.allowSubAgents
              ? p.agents.disableDelegate
              : p.agents.enableDelegate
          "
        >
          <input
            type="checkbox"
            :checked="modelValue.allowSubAgents"
            :disabled="disabled"
            @change="onAllowSubAgentsChange"
          />
          <span
            class="sp-toggle-track"
            :class="{ 'sp-toggle-track--on': modelValue.allowSubAgents }"
          />
        </label>
      </div>

      <template v-if="modelValue.allowSubAgents">
        <div class="aft-field">
          <label class="aft-label">{{ p.agents.allowedTargets }}</label>
          <p class="aft-hint">
            {{ p.agents.allowedTargetsHint }}
          </p>
        </div>

        <div
          v-if="delegatableAgents.length === 0"
          class="aft-toolset-empty"
        >
          {{ p.agents.noDelegatableAgents }}
        </div>

        <div v-else class="aft-mcp-grid">
          <label
            v-for="target in delegatableAgents"
            :key="target.id"
            class="aft-mcp-card"
            :class="{
              'aft-mcp-card--enabled': isSubAgentTargetSelected(target.id),
              'aft-mcp-card--disabled': disabled,
            }"
          >
            <span class="aft-mcp-card-head">
              <span class="aft-mcp-name">{{ target.name }}</span>
              <label
                class="sp-toggle"
                :title="
                  isSubAgentTargetSelected(target.id)
                    ? p.agents.removeTarget.replace('{name}', target.name)
                    : p.agents.allowTarget.replace('{name}', target.name)
                "
                @click.stop
              >
                <input
                  type="checkbox"
                  :checked="isSubAgentTargetSelected(target.id)"
                  :disabled="disabled"
                  @change="onSubAgentTargetChange(target.id, $event)"
                />
                <span
                  class="sp-toggle-track"
                  :class="{
                    'sp-toggle-track--on': isSubAgentTargetSelected(target.id),
                  }"
                />
              </label>
            </span>
            <span class="aft-mcp-meta">{{ target.id }}</span>
            <span v-if="target.description" class="aft-mcp-desc">
              {{ target.description }}
            </span>
          </label>
        </div>
      </template>
    </div>

    <!-- MCP tab -->
    <div
      v-else-if="activeTab === 'mcp'"
      class="aft-card"
      :class="{ 'aft-card--disabled': disabled }"
    >
      <div v-if="agentStore.mcpServers.length === 0" class="aft-toolset-empty">
        {{ p.agents.noMcpServers }}
      </div>

      <template v-else>
        <div class="aft-field">
          <label class="aft-label">{{ p.agents.tabs.mcp }}</label>
          <p class="aft-hint">
            {{ p.agents.mcpServersHint }}
          </p>
        </div>

        <div class="aft-mcp-grid">
          <label
            v-for="server in agentStore.mcpServers"
            :key="server.id"
            class="aft-mcp-card"
            :class="{
              'aft-mcp-card--enabled': effectiveMcpServers.includes(server.id),
              'aft-mcp-card--disabled': disabled,
            }"
          >
            <span class="aft-mcp-card-head">
              <span class="aft-mcp-name">{{ server.name }}</span>
              <label
                class="sp-toggle"
                :title="
                  effectiveMcpServers.includes(server.id)
                    ? p.mcp.disableServer
                    : p.mcp.enableServer
                "
                @click.stop
              >
                <input
                  type="checkbox"
                  :checked="effectiveMcpServers.includes(server.id)"
                  :disabled="disabled"
                  @change="
                    toggleMcpServer(
                      server.id,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
                <span
                  class="sp-toggle-track"
                  :class="{
                    'sp-toggle-track--on': effectiveMcpServers.includes(server.id),
                  }"
                />
              </label>
            </span>
            <span class="aft-mcp-meta">
              {{ server.transportType.toUpperCase() }}
            </span>
          </label>
        </div>
      </template>
    </div>

    <!-- Prompt group tab -->
    <div v-else-if="activeTab === 'prompt'" class="aft-prompt-pane">
      <div class="aft-subtabs">
        <button
          v-for="ptab in promptTabs"
          :key="ptab.id"
          class="aft-subtab"
          :class="{ 'aft-subtab--active': activePromptTab === ptab.id }"
          @click="activePromptTab = ptab.id"
        >
          {{ ptab.label }}
        </button>
      </div>

      <SkillAttachmentsPanel
        v-if="isAttachmentsPromptTab && effectiveSkillId"
        :skill-id="effectiveSkillId"
        class="aft-attachments-pane"
      />

      <template v-else-if="!isAttachmentsPromptTab">
        <p v-if="skillPromptNotice" class="aft-prompt-notice">
          {{ skillPromptNotice }}
        </p>

        <div class="aft-prompt-toolbar">
          <span class="aft-prompt-title">{{ activePromptTabTitle }}</span>
          <label
            class="aft-toggle"
            for="prompt-preview-toggle"
          >
            <input
              id="prompt-preview-toggle"
              v-model="previewModeByTab[activePromptTab]"
              type="checkbox"
              class="aft-toggle-input"
            />
            <span class="aft-toggle-track">
              <span class="aft-toggle-thumb" />
            </span>
            <span class="aft-toggle-label">
              {{ previewModeByTab[activePromptTab] ? p.agents.preview : p.agents.edit }}
            </span>
          </label>
        </div>

        <textarea
          v-if="!previewModeByTab[activePromptTab]"
          class="aft-textarea"
          :value="activePromptValue"
          :placeholder="`Enter ${activePromptTabLabel.toLowerCase()} instructions…`"
          @input="onPromptInput"
        />

        <div
          v-else
          class="aft-markdown-preview aft-markdown-preview--readonly"
          v-html="renderedPromptPreview"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import type { ProviderType } from '@store/agent'
import { skillIsGoogleWorkspaceAgent } from '@shared/agent/google-workspace-agent'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'
import AgentConfigurationsTab from './AgentConfigurationsTab.vue'
import { useAgentStore } from '@store/agent'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import { useI18n } from '@renderer/composables/useI18n'
import {
  buildRuntimePromptViews,
  type RuntimeCompiledPromptSource,
} from '@shared/agent/skill-runtime-prompts'
import {
  clampTodoMaxRetries,
  clampToolLoopMaxIterations,
  DEFAULT_TODO_MAX_RETRIES,
  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
  MAX_TODO_MAX_RETRIES,
  MAX_TOOL_LOOP_MAX_ITERATIONS,
  MIN_TODO_MAX_RETRIES,
  MIN_TOOL_LOOP_MAX_ITERATIONS,
} from '@shared/agent/tool-loop'
import {
  isSubAgentTargetAllowed,
  toggleSubAgentTargetSelection,
} from '@shared/agent/sub-agent-settings'
import {
  AGENT_LLM_STAGES,
  hasToolLoopRecoveryOverride,
  type AgentLlmChoice,
  type AgentLlmRoutingMode,
  type AgentLlmStage,
} from '@shared/agent/stage-llm-settings'
import AvailableSetCards from './AvailableSetCards.vue'
import AgentLlmStagePicker from './AgentLlmStagePicker.vue'
import LlmProviderSelect from './LlmProviderSelect.vue'
import LlmModelSelect from './LlmModelSelect.vue'
import SkillAttachmentsPanel from './SkillAttachmentsPanel.vue'
import './sp-shared.css'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

const defaultToolLoopMaxIterations = DEFAULT_TOOL_LOOP_MAX_ITERATIONS
const defaultTodoMaxRetries = DEFAULT_TODO_MAX_RETRIES
const toolLoopMin = MIN_TOOL_LOOP_MAX_ITERATIONS
const toolLoopMax = MAX_TOOL_LOOP_MAX_ITERATIONS
const todoRetryMin = MIN_TODO_MAX_RETRIES
const todoRetryMax = MAX_TODO_MAX_RETRIES

type AgentColor =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'neutral'

export interface AgentFormData {
  name: string
  description: string
  provider: ProviderType
  model: string
  color: AgentColor
  skillsPrompt: string
  availableSkillTools: Array<{
    name: string
    description: string
    tags?: string[]
    /** Catalog default from skill/toolSet (override via toolNeedsApprovalOverrides) */
    needsApproval?: boolean
  }>
  availableSet: string[]
  availableSetTouched: boolean
  /** Per-tool override for approval; omit key to use catalog default */
  toolNeedsApprovalOverrides: Record<string, boolean>
  /** null = all enabled MCP servers; string[] = explicit list of server IDs */
  availableMcpServers: string[] | null
  /** Max agentic-run steps per execution (default 40). */
  toolLoopMaxIterations: number
  /** Max full todo re-attempts when fallback_plan is retry (default 3). */
  todoMaxRetries: number
  allowAsSubAgent: boolean
  allowSubAgents: boolean
  /** Allow-list for invoke_agent; empty = any eligible sub-agent. */
  subAgentIds: string[]
  llmRoutingMode: AgentLlmRoutingMode
  stageLlm: Partial<Record<AgentLlmStage, AgentLlmChoice>>
}

const props = defineProps<{
  modelValue: AgentFormData
  availableModels?: string[]
  disabled?: boolean
  /** Pass a changing key to reset the active tab (e.g. agent id) */
  resetKey?: string | null
  /** Skill folder id when configuring a skill-backed agent */
  skillId?: string | null
  /** Declared config.properties fields from the skill's properties.md */
  systemProperties?: readonly SkillSystemPropertySpec[]
  /** Catalog agent id being edited (for sub-agent targeting). */
  agentId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AgentFormData): void
}>()

function onToolLoopMaxIterationsInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', {
    ...props.modelValue,
    toolLoopMaxIterations: clampToolLoopMaxIterations(raw),
  })
}

function onTodoMaxRetriesInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', {
    ...props.modelValue,
    todoMaxRetries: clampTodoMaxRetries(raw),
  })
}

type RootTabId =
  | 'general'
  | 'configurations'
  | 'toolset'
  | 'mcp'
  | 'subagents'
  | 'prompt'
type PromptTabId = 'skill' | 'attachments'
type PromptTextTabId = 'skill'

const agentStore = useAgentStore()

function onProviderChange(provider: ProviderType) {
  if (provider === props.modelValue.provider) return
  emit('update:modelValue', {
    ...props.modelValue,
    provider,
    model: '',
  })
}

const agentLlmStages = AGENT_LLM_STAGES.filter(
  (stage) => stage !== 'toolLoopRecovery',
)
const agentLlmStageLabels = computed(
  (): Record<AgentLlmStage, string> => ({
    explore: p.value.agents.stages.explore,
    toolLoop: p.value.agents.stages.toolLoop,
    toolLoopRecovery: p.value.agents.stages.toolLoopRecovery,
    verifier: p.value.agents.stages.verifier,
  }),
)

const hasRecoveryOverride = computed(() =>
  hasToolLoopRecoveryOverride(props.modelValue.stageLlm),
)

const recoveryChoice = computed((): AgentLlmChoice =>
  props.modelValue.stageLlm.toolLoopRecovery ?? stageChoice('toolLoop'),
)

function setRecoveryInherit(inherit: boolean) {
  if (inherit) {
    const next = { ...props.modelValue.stageLlm }
    delete next.toolLoopRecovery
    emit('update:modelValue', { ...props.modelValue, stageLlm: next })
    return
  }
  updateRecoveryLlm(recoveryChoice.value)
}

function updateRecoveryLlm(choice: AgentLlmChoice) {
  updateStageLlm('toolLoopRecovery', choice)
}

function setLlmRoutingMode(mode: AgentLlmRoutingMode) {
  emit('update:modelValue', { ...props.modelValue, llmRoutingMode: mode })
}

function stageChoice(stage: AgentLlmStage): AgentLlmChoice {
  return (
    props.modelValue.stageLlm[stage] ?? {
      provider: props.modelValue.provider,
      model: props.modelValue.model,
    }
  )
}

function updateStageLlm(stage: AgentLlmStage, choice: AgentLlmChoice) {
  emit('update:modelValue', {
    ...props.modelValue,
    stageLlm: { ...props.modelValue.stageLlm, [stage]: choice },
  })
}

const hasConfigurationsTab = computed(
  () =>
    (props.systemProperties?.length ?? 0) > 0 ||
    skillIsGoogleWorkspaceAgent(props.skillId),
)

const tabs = computed((): { id: RootTabId; label: string }[] => {
  const next: { id: RootTabId; label: string }[] = [
    { id: 'general', label: p.value.agents.tabs.general },
  ]
  if (hasConfigurationsTab.value) {
    next.push({
      id: 'configurations',
      label: p.value.agents.tabs.configurations,
    })
  }
  next.push(
    { id: 'prompt', label: p.value.agents.tabs.prompt },
    { id: 'toolset', label: p.value.agents.tabs.toolset },
    { id: 'subagents', label: p.value.agents.tabs.subagents },
    { id: 'mcp', label: p.value.agents.tabs.mcp },
  )
  return next
})

const delegatableAgents = computed(() =>
  agentStore.agents
    .filter((a) => a.id !== props.agentId)
    .filter((a) => a.allowAsSubAgent !== false)
    .filter((a) => !isWorkflowPanelAgentId(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? '',
    })),
)

function onAllowAsSubAgentChange(event: Event) {
  const allow = (event.target as HTMLInputElement).checked
  emit('update:modelValue', { ...props.modelValue, allowAsSubAgent: allow })
}

function onAllowSubAgentsChange(event: Event) {
  const allow = (event.target as HTMLInputElement).checked
  emit('update:modelValue', {
    ...props.modelValue,
    allowSubAgents: allow,
    ...(allow ? {} : { subAgentIds: [] }),
  })
}

function onSubAgentTargetChange(agentId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  emit('update:modelValue', {
    ...props.modelValue,
    subAgentIds: toggleSubAgentTargetSelection(
      agentId,
      checked,
      props.modelValue.subAgentIds,
      delegatableAgents.value.map((agent) => agent.id),
    ),
  })
}

function isSubAgentTargetSelected(agentId: string): boolean {
  return isSubAgentTargetAllowed(agentId, props.modelValue.subAgentIds)
}

const promptTabs = computed((): { id: PromptTabId; label: string }[] => {
  const next: { id: PromptTabId; label: string }[] = [
    { id: 'skill', label: p.value.agents.promptTabs.skill },
  ]
  if (effectiveSkillId.value) {
    next.push({ id: 'attachments', label: p.value.agents.promptTabs.attachments })
  }
  return next
})

const activeTab = ref<RootTabId>('general')
const activePromptTab = ref<PromptTabId>('skill')
const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

const promptFields: Partial<Record<PromptTextTabId, keyof AgentFormData>> = {
  skill: 'skillsPrompt',
}

const promptTabLabelMap = computed(
  (): Record<PromptTextTabId, string> => ({
    skill: p.value.agents.promptTabs.skill,
  }),
)

const previewModeByTab = ref<Record<PromptTextTabId, boolean>>({
  skill: false,
})

type CompilationStatus = 'pending' | 'ready' | 'failed' | 'missing'

const compilationStatus = ref<CompilationStatus>('missing')
const compiledArtifact = ref<RuntimeCompiledPromptSource | null>(null)
const compilationLoading = ref(false)

const effectiveSkillId = computed(() => props.skillId?.trim() || null)

const isAttachmentsPromptTab = computed(
  () => activePromptTab.value === 'attachments',
)

const usesCompiledRuntimePrompts = computed(
  () =>
    Boolean(effectiveSkillId.value) &&
    compilationStatus.value === 'ready' &&
    Boolean(compiledArtifact.value),
)

const runtimePromptViews = computed(() =>
  buildRuntimePromptViews(compiledArtifact.value),
)

const activePromptTabLabel = computed(() => {
  if (isAttachmentsPromptTab.value) return p.value.agents.promptTabs.attachments
  return promptTabLabelMap.value[activePromptTab.value as PromptTextTabId]
})

const activePromptTabTitle = computed(() => {
  return p.value.agents.promptTabInstructions.replace(
    '{label}',
    activePromptTabLabel.value,
  )
})

const skillPromptNotice = computed(() => {
  if (!effectiveSkillId.value) return ''
  if (compilationLoading.value) return p.value.agents.compilationLoadingStatus
  if (compilationStatus.value === 'ready') {
    return p.value.agents.compilationReadyNotice
  }
  if (compilationStatus.value === 'failed') {
    return p.value.agents.compilationFailedNotice
  }
  return p.value.agents.compilationMissingNotice
})

const activePromptValue = computed(() => {
  if (isAttachmentsPromptTab.value) return ''

  const tab = activePromptTab.value as PromptTextTabId
  const field = promptFields[tab]
  if (!field) return ''
  return props.modelValue[field] ?? ''
})

async function loadSkillCompilation(): Promise<void> {
  const skillId = effectiveSkillId.value
  if (!skillId) {
    compiledArtifact.value = null
    compilationStatus.value = 'missing'
    return
  }

  const channel = window.ipcRendererChannel?.GetSkillCompilation
  if (!channel?.invoke) {
    compiledArtifact.value = null
    compilationStatus.value = 'missing'
    return
  }

  compilationLoading.value = true
  try {
    const result = await channel.invoke({ skillId })
    compilationStatus.value = result.status
    compiledArtifact.value =
      (result.compiled as RuntimeCompiledPromptSource | null) ?? null
  } catch {
    compiledArtifact.value = null
    compilationStatus.value = 'missing'
  } finally {
    compilationLoading.value = false
  }
}

const renderedPromptPreview = computed(() => {
  const text = activePromptValue.value.trim()
  if (!text) {
    return '<p class="aft-markdown-empty">Nothing to preview yet.</p>'
  }
  return markdown.render(activePromptValue.value)
})

const availableSetProxy = computed<string[]>({
  get() {
    return props.modelValue.availableSet ?? []
  },
  set(value) {
    emit('update:modelValue', {
      ...props.modelValue,
      availableSet: value,
      availableSetTouched: true,
    })
  },
})

const availableSetTouchedProxy = computed<boolean>({
  get() {
    return props.modelValue.availableSetTouched ?? false
  },
  set(value) {
    emit('update:modelValue', {
      ...props.modelValue,
      availableSetTouched: value,
    })
  },
})

const approvalOverridesProxy = computed<Record<string, boolean>>({
  get() {
    return props.modelValue.toolNeedsApprovalOverrides ?? {}
  },
  set(value) {
    emit('update:modelValue', {
      ...props.modelValue,
      toolNeedsApprovalOverrides: value,
    })
  },
})

// MCP: null means all enabled servers; track whether we've touched it
const mcpAllEnabled = computed(
  () => props.modelValue.availableMcpServers === null,
)

const effectiveMcpServers = computed<string[]>(() => {
  if (props.modelValue.availableMcpServers === null) {
    // All servers enabled — return all server IDs
    return agentStore.mcpServers.map((s) => s.id)
  }
  return props.modelValue.availableMcpServers ?? []
})

function toggleMcpServer(serverId: string, enabled: boolean) {
  const current =
    props.modelValue.availableMcpServers === null
      ? agentStore.mcpServers.map((s) => s.id)
      : [...(props.modelValue.availableMcpServers ?? [])]
  const next = new Set(current)
  if (enabled) next.add(serverId)
  else next.delete(serverId)
  emit('update:modelValue', {
    ...props.modelValue,
    availableMcpServers: Array.from(next),
  })
}

function onPromptInput(event: Event) {
  if (activeTab.value !== 'prompt' || isAttachmentsPromptTab.value) {
    return
  }
  const field = promptFields[activePromptTab.value as PromptTextTabId]
  if (!field) return
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: (event.target as HTMLTextAreaElement).value,
  })
}

watch(
  () => props.resetKey,
  () => {
    activeTab.value = 'general'
    activePromptTab.value = 'skill'
  },
)

watch(hasConfigurationsTab, (visible) => {
  if (!visible && activeTab.value === 'configurations') {
    activeTab.value = 'general'
  }
})

watch(
  () => [activeTab.value, effectiveSkillId.value] as const,
  ([tab, skillId]) => {
    if (tab === 'prompt' && skillId) void loadSkillCompilation()
    if (tab === 'mcp' && agentStore.mcpServers.length === 0) {
      void agentStore.loadMcpServers()
    }
  },
)

watch(
  effectiveSkillId,
  (id) => {
    if (!id) {
      if (activePromptTab.value === 'attachments') {
        activePromptTab.value = 'skill'
      }
      compiledArtifact.value = null
      compilationStatus.value = 'missing'
      return
    }
    activePromptTab.value = 'skill'
    void loadSkillCompilation()
  },
  { immediate: true },
)
</script>

<style scoped>
.aft-prompt-notice {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ui-bg-accented);
  border: 1px solid var(--ui-border);
}

.aft-markdown-preview--readonly {
  flex: 1;
  min-height: 12rem;
}

.aft-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  height: 100%;
  min-height: 0;
}

.aft-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--ui-border);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.aft-tab {
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition:
    color 0.12s,
    border-color 0.12s;
  margin-bottom: -1px;
}

.aft-tab:hover {
  color: var(--ui-text);
}

.aft-tab--active {
  color: var(--color-primary-600);
  border-bottom-color: var(--color-primary-500);
}

.aft-card {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.aft-card--disabled {
  opacity: 0.55;
}

.aft-toolset-empty {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.aft-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.aft-routing-toggle {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aft-routing-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-text);
  cursor: pointer;
}

.aft-stage-llm-block {
  gap: 8px;
}

.aft-stage-llm-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.aft-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.aft-input {
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

.aft-input:focus {
  border-color: var(--color-primary-500);
}

.aft-select {
  appearance: auto;
  cursor: pointer;
}

.aft-prompt-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.aft-attachments-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated);
}

.aft-subtabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--ui-border);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.aft-subtab {
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 600;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition:
    color 0.12s,
    border-color 0.12s;
  margin-bottom: -1px;
}

.aft-subtab:hover {
  color: var(--ui-text);
}

.aft-subtab--active {
  color: var(--color-primary-600);
  border-bottom-color: var(--color-primary-500);
}

.aft-prompt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.aft-prompt-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.aft-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.aft-toggle-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.aft-toggle-track {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--ui-bg-accented);
  border: 1px solid var(--ui-border);
  transition: background 0.15s;
}

.aft-toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  transition: transform 0.15s;
}

.aft-toggle-input:checked + .aft-toggle-track {
  background: color-mix(in srgb, var(--color-primary-500) 25%, transparent);
}

.aft-toggle-input:checked + .aft-toggle-track .aft-toggle-thumb {
  transform: translateX(14px);
}

.aft-toggle-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.aft-textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--ui-text);
  outline: none;
  font-family: var(--app-font-family);
  resize: none;
  line-height: 1.55;
  transition: border-color 0.15s;
  box-sizing: border-box;
  flex: 1;
  overflow-y: auto;
}

.aft-textarea:focus {
  border-color: var(--color-primary-500);
}

.aft-markdown-preview {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: var(--app-font-family);
  font-size: 14px;
  color: var(--ui-text);
  line-height: 1.55;
  box-sizing: border-box;
  flex: 1;
  overflow-y: auto;
}

.aft-markdown-preview :deep(p) {
  margin: 0;
}

.aft-markdown-preview :deep(p + p) {
  margin-top: 0.8em;
}

.aft-markdown-preview :deep(ul),
.aft-markdown-preview :deep(ol) {
  margin: 0.7em 0 0;
  padding-left: 1.2em;
}

.aft-markdown-preview :deep(code:not(pre code)) {
  font-family: var(--app-font-family);
  font-size: 0.85em;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ui-bg-accented);
}

.aft-markdown-preview :deep(pre) {
  margin: 8px 0 2px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  overflow-x: auto;
}

.aft-markdown-preview :deep(pre code) {
  background: none;
  padding: 0;
}

.aft-markdown-preview :deep(.aft-markdown-empty) {
  color: var(--ui-text-muted);
}

.aft-subagent-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.aft-subagent-row--divider {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border);
}

.aft-subagent-row-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.aft-subagent-row-text .aft-label {
  margin: 0;
}

.aft-mcp-desc {
  font-size: 10px;
  color: var(--ui-text-muted);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── MCP tab ── */
.aft-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin: 0;
}

.aft-hint code {
  font-size: 10px;
}

.aft-mcp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.aft-mcp-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  min-height: 54px;
  transition: border-color 0.12s;
}

.aft-mcp-card:hover {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500) 35%,
    var(--ui-border)
  );
}

.aft-mcp-card--enabled {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500) 55%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-primary-500) 8%,
    var(--ui-bg-elevated)
  );
}

.aft-mcp-card--disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.aft-mcp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.aft-mcp-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.aft-mcp-meta {
  font-size: 10px;
  font-weight: 700;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
