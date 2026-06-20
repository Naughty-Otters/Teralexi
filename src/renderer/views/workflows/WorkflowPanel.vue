<template>
  <div class="wf-panel">
    <div class="wf-toolbar">
      <button type="button" class="icon-btn" @click="emit('close')">✕</button>
    </div>

    <div class="wf-body">
      <aside class="wf-list">
        <div class="wf-list-header">
          <button
            type="button"
            class="wf-btn wf-btn--primary"
            @click="openNewWorkflowDialog"
          >
            {{ t.workflows.newWorkflow }}
          </button>
        </div>
        <button
          v-for="item in workflows"
          :key="item.id"
          type="button"
          class="wf-list-item"
          :class="{ 'wf-list-item--active': selectedId === item.id }"
          @click="selectWorkflow(item.id)"
        >
          <span class="wf-list-item-name">{{ item.name }}</span>
          <span class="wf-list-item-status">{{ item.status }}</span>
        </button>
      </aside>

      <section v-if="selectedId" class="wf-main">
        <div class="wf-main-header">
          <div class="wf-tabs">
            <button
              v-for="tab in studioTabs"
              :key="tab.id"
              type="button"
              class="wf-tab"
              :class="{ 'wf-tab--active': activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
          <button
            type="button"
            class="wf-btn wf-btn--danger"
            :disabled="deleting"
            @click="openDeleteDialog"
          >
            {{ t.workflows.deleteWorkflow }}
          </button>
        </div>

        <WorkflowStudio
          v-if="activeTab === 'define'"
          :workflow-id="selectedId"
          :snapshot="snapshot"
          @compiled="reloadSnapshot"
          @confirmed="reloadSnapshot"
        />
        <WorkflowTestPanel
          v-else-if="activeTab === 'test'"
          :workflow-id="selectedId"
          :snapshot="snapshot"
        />
        <WorkflowDeployPanel
          v-else-if="activeTab === 'deploy'"
          :workflow-id="selectedId"
          :snapshot="snapshot"
          @deployed="reloadSnapshot"
        />
      </section>

      <section v-else class="wf-empty">
        <p>{{ t.workflows.selectOrCreate }}</p>
      </section>
    </div>

    <footer v-if="panelSkills.length" class="wf-skills-footer">
      <span class="wf-skills-label">{{ t.workflows.panelSkills.label }}</span>
      <span
        v-for="skill in panelSkills"
        :key="skill.id"
        class="wf-skill-chip"
        :title="skill.description"
      >
        <UIcon
          class="wf-skill-chip-icon"
          :name="skill.role === 'compiler' ? 'i-lucide-sparkles' : 'i-lucide-play-circle'"
        />
        {{ skill.name }}
      </span>
    </footer>

    <div
      v-if="showNewDialog"
      class="wf-dialog-backdrop"
      @click.self="closeNewWorkflowDialog"
    >
      <form class="wf-dialog" @submit.prevent="submitCreateWorkflow">
        <h3 class="wf-dialog-title">{{ t.workflows.createDialog.title }}</h3>

        <label class="wf-field">
          <span>{{ t.workflows.createDialog.nameLabel }}</span>
          <input
            v-model="newWorkflowName"
            type="text"
            class="wf-input"
            :placeholder="t.workflows.createDialog.namePlaceholder"
            autofocus
          />
        </label>

        <label class="wf-field">
          <span>{{ t.workflows.createDialog.descriptionLabel }}</span>
          <textarea
            v-model="newWorkflowDescription"
            class="wf-textarea"
            rows="3"
            :placeholder="t.workflows.createDialog.descriptionPlaceholder"
          />
        </label>

        <div class="wf-dialog-actions">
          <button
            type="button"
            class="wf-btn"
            :disabled="creating"
            @click="closeNewWorkflowDialog"
          >
            {{ t.workflows.createDialog.cancel }}
          </button>
          <button type="submit" class="wf-btn wf-btn--primary" :disabled="creating">
            {{
              creating
                ? t.workflows.createDialog.creating
                : t.workflows.createDialog.create
            }}
          </button>
        </div>
      </form>
    </div>

    <Teleport to="body">
      <div
        v-if="showDeleteDialog"
        class="wf-dialog-backdrop"
        @click.self="closeDeleteDialog"
      >
        <div class="wf-dialog wf-dialog--delete">
          <h3 class="wf-dialog-title">{{ t.workflows.deleteDialog.title }}</h3>
          <p class="wf-dialog-message">
            {{ t.workflows.deleteDialog.message.replace('{name}', deleteTargetName) }}
          </p>
          <div class="wf-dialog-actions">
            <button
              type="button"
              class="wf-btn"
              :disabled="deleting"
              @click="closeDeleteDialog"
            >
              {{ t.workflows.deleteDialog.cancel }}
            </button>
            <button
              type="button"
              class="wf-btn wf-btn--danger"
              :disabled="deleting"
              @click="confirmDelete"
            >
              {{
                deleting
                  ? t.workflows.deleteDialog.deleting
                  : t.workflows.deleteDialog.confirm
              }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import WorkflowStudio from './WorkflowStudio.vue'
import WorkflowTestPanel from './WorkflowTestPanel.vue'
import WorkflowDeployPanel from './WorkflowDeployPanel.vue'

type WorkflowRow = {
  id: string
  name: string
  status: string
}

type WorkflowSnapshot = {
  workflow: WorkflowRow & {
    description: string
    currentVersionId: string | null
  }
  versions: Array<{
    id: string
    versionNumber: number
    definitionJson: string
    mermaid: string
    summaryMarkdown: string
  }>
  deployments: Array<{
    id: string
    versionId: string
    target: string
    enabled: boolean
    lastRunAt: string | null
    lastError: string | null
  }>
}

type WorkflowPanelSkill = {
  id: string
  name: string
  description: string
  role: 'compiler' | 'runtime'
}

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToast()
const workflows = ref<WorkflowRow[]>([])
const selectedId = ref<string | null>(null)
const snapshot = ref<WorkflowSnapshot | null>(null)
const activeTab = ref<'define' | 'test' | 'deploy'>('define')
const showNewDialog = ref(false)
const newWorkflowName = ref('')
const newWorkflowDescription = ref('')
const creating = ref(false)
const deleting = ref(false)
const panelSkills = ref<WorkflowPanelSkill[]>([])
const showDeleteDialog = ref(false)
const deleteTargetId = ref<string | null>(null)
const deleteTargetName = ref('')

const studioTabs = computed(() => [
  { id: 'define' as const, label: t.value.workflows.tabs.define },
  { id: 'test' as const, label: t.value.workflows.tabs.test },
  { id: 'deploy' as const, label: t.value.workflows.tabs.deploy },
])

async function loadPanelSkills() {
  const list = await window.ipcRendererChannel?.ListWorkflowPanelSkills?.invoke()
  panelSkills.value = list ?? []
}

async function loadWorkflows() {
  const list = await window.ipcRendererChannel?.ListWorkflows?.invoke({
    userId: 'default',
  })
  workflows.value = (list ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
  }))
}

async function reloadSnapshot() {
  if (!selectedId.value) return
  snapshot.value =
    (await window.ipcRendererChannel?.GetWorkflowSnapshot?.invoke({
      workflowId: selectedId.value,
    })) ?? null
  await loadWorkflows()
}

async function selectWorkflow(id: string) {
  selectedId.value = id
  await reloadSnapshot()
}

function openNewWorkflowDialog() {
  newWorkflowName.value = ''
  newWorkflowDescription.value = ''
  showNewDialog.value = true
}

function closeNewWorkflowDialog() {
  if (creating.value) return
  showNewDialog.value = false
}

function validateName(): boolean {
  if (!newWorkflowName.value.trim()) {
    toast.add({
      title: t.value.workflows.createDialog.nameRequired,
      color: 'warning',
    })
    return false
  }
  return true
}

async function finishCreate(workflowId: string) {
  selectedId.value = workflowId
  activeTab.value = 'define'
  showNewDialog.value = false
  await reloadSnapshot()
}

async function submitCreateWorkflow() {
  if (!validateName()) return
  creating.value = true
  try {
    const result = await window.ipcRendererChannel?.CreateWorkflowDraft?.invoke({
      userId: 'default',
      name: newWorkflowName.value.trim(),
      description: newWorkflowDescription.value.trim() || undefined,
    })
    if (!result?.workflowId) {
      throw new Error(t.value.workflows.createDialog.createFailed)
    }
    await finishCreate(result.workflowId)
  } catch (err) {
    toast.add({
      title: t.value.workflows.createDialog.createFailed,
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  } finally {
    creating.value = false
  }
}

function openDeleteDialog() {
  if (!selectedId.value) return
  const row = workflows.value.find((w) => w.id === selectedId.value)
  deleteTargetId.value = selectedId.value
  deleteTargetName.value = row?.name ?? selectedId.value
  showDeleteDialog.value = true
}

function resetDeleteDialog() {
  showDeleteDialog.value = false
  deleteTargetId.value = null
  deleteTargetName.value = ''
}

function closeDeleteDialog() {
  if (deleting.value) return
  resetDeleteDialog()
}

async function confirmDelete() {
  const id = deleteTargetId.value
  if (!id || deleting.value) return
  deleting.value = true
  try {
    await window.ipcRendererChannel?.DeleteWorkflow?.invoke({
      userId: 'default',
      workflowId: id,
    })
    if (selectedId.value === id) {
      selectedId.value = null
      snapshot.value = null
    }
    resetDeleteDialog()
    await loadWorkflows()
    toast.add({
      title: t.value.workflows.deleteDialog.success,
      color: 'success',
    })
  } catch (err) {
    toast.add({
      title: t.value.workflows.deleteDialog.failed,
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    })
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  void loadWorkflows()
  void loadPanelSkills()
})
</script>

<style scoped>
.wf-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.wf-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
}
.wf-toolbar .icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 15px;
  cursor: pointer;
}
.wf-toolbar .icon-btn:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}
.wf-toolbar .icon-btn--active {
  color: var(--color-primary-500);
}
.wf-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.wf-list {
  width: 240px;
  border-right: 1px solid var(--ui-border);
  overflow: auto;
  padding: 12px;
}
.wf-list-header {
  margin-bottom: 12px;
}
.wf-list-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}
.wf-main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-right: 16px;
  border-bottom: 1px solid var(--ui-border);
}
.wf-main-header .wf-tabs {
  border-bottom: none;
  flex: 1;
}
.wf-btn--danger {
  background: color-mix(in srgb, var(--ui-error) 12%, var(--ui-bg));
  color: var(--ui-error);
  border-color: color-mix(in srgb, var(--ui-error) 35%, var(--ui-border));
  width: auto;
  flex-shrink: 0;
}
.wf-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-error) 18%, var(--ui-bg));
}
.wf-dialog-message {
  margin: 0 0 16px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}
.wf-list-item--active {
  border-color: var(--ui-border);
  background: var(--ui-bg-muted);
}
.wf-list-item-name {
  font-weight: 600;
}
.wf-list-item-status {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-transform: capitalize;
}
.wf-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.wf-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--ui-border);
}
.wf-tab {
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.wf-tab--active {
  border-bottom-color: var(--ui-primary);
  font-weight: 600;
}
.wf-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
}
.wf-btn {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  cursor: pointer;
  background: var(--ui-bg);
}
.wf-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.wf-btn--primary {
  background: var(--ui-primary);
  color: white;
  border-color: transparent;
  width: 100%;
}
.wf-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
}
.wf-dialog {
  width: min(480px, calc(100vw - 32px));
  padding: 20px;
  border-radius: 12px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.wf-dialog-title {
  margin: 0 0 16px;
  font-size: 1.1rem;
  font-weight: 600;
}
.wf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.875rem;
}
.wf-input,
.wf-textarea {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  font: inherit;
}
.wf-textarea {
  resize: vertical;
  min-height: 96px;
}
.wf-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.wf-dialog-actions .wf-btn--primary,
.wf-dialog-actions .wf-btn--danger {
  width: auto;
}
.wf-skills-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  flex-shrink: 0;
}
.wf-skills-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
  margin-right: 4px;
}
.wf-skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8125rem;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  color: var(--ui-text);
}
.wf-skill-chip-icon {
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted);
}
</style>
