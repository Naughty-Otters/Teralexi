<template>
  <div class="wf-deploy">
    <div class="wf-deploy-toolbar">
      <button
        class="wf-btn wf-btn--primary"
        :disabled="!versionId || deploying"
        @click="deployLocal"
      >
        {{ t.workflows.deploy.local }}
      </button>
      <button
        class="wf-btn"
        :disabled="!activeDeploymentId || undeploying"
        @click="undeploy"
      >
        {{ t.workflows.deploy.undeploy }}
      </button>
      <button class="wf-btn" :disabled="!versionId" @click="runManual">
        {{ t.workflows.deploy.runNow }}
      </button>
    </div>

    <div v-if="deployments.length" class="wf-deploy-list">
      <h4>{{ t.workflows.deploy.active }}</h4>
      <div v-for="dep in deployments" :key="dep.id" class="wf-deploy-item">
        <span>{{ dep.target }}</span>
        <span>{{ dep.enabled ? 'enabled' : 'disabled' }}</span>
        <span v-if="dep.lastError" class="wf-error">{{ dep.lastError }}</span>
      </div>
    </div>

    <p v-if="lastRunMessage" class="wf-muted">{{ lastRunMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const props = defineProps<{
  workflowId: string
  snapshot: {
    workflow: { currentVersionId: string | null; status: string }
    deployments: Array<{
      id: string
      target: string
      enabled: boolean
      lastError: string | null
    }>
  } | null
}>()

const emit = defineEmits<{ deployed: [] }>()

const { t } = useI18n()
const deploying = ref(false)
const undeploying = ref(false)
const lastRunMessage = ref('')

const versionId = computed(
  () => props.snapshot?.workflow.currentVersionId ?? null,
)
const deployments = computed(() => props.snapshot?.deployments ?? [])
const activeDeploymentId = computed(() => deployments.value[0]?.id ?? null)

async function deployLocal() {
  if (!versionId.value) return
  deploying.value = true
  try {
    await window.ipcRendererChannel?.DeployWorkflow?.invoke({
      workflowId: props.workflowId,
      versionId: versionId.value,
      target: 'local',
      enabled: true,
    })
    emit('deployed')
  } finally {
    deploying.value = false
  }
}

async function undeploy() {
  if (!activeDeploymentId.value) return
  undeploying.value = true
  try {
    await window.ipcRendererChannel?.UndeployWorkflow?.invoke({
      deploymentId: activeDeploymentId.value,
    })
    emit('deployed')
  } finally {
    undeploying.value = false
  }
}

async function runManual() {
  const result = await window.ipcRendererChannel?.RunWorkflowManual?.invoke({
    workflowId: props.workflowId,
    versionId: versionId.value ?? undefined,
  })
  lastRunMessage.value = result?.success
    ? t.value.workflows.deploy.runSuccess
    : (result?.errorMessage ?? t.value.workflows.deploy.runFailed)
}
</script>

<style scoped>
.wf-deploy {
  padding: 16px;
}
.wf-deploy-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wf-deploy-list {
  margin-top: 16px;
}
.wf-deploy-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ui-border);
}
.wf-muted {
  margin-top: 12px;
  color: var(--ui-text-muted);
}
.wf-error {
  color: var(--ui-error);
}
.wf-btn {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  cursor: pointer;
}
.wf-btn--primary {
  background: var(--ui-primary);
  color: white;
  border-color: transparent;
}
</style>
