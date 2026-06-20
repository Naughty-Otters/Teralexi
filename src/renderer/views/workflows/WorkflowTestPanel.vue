<template>
  <div class="wf-test">
    <div class="wf-test-toolbar">
      <button
        class="wf-btn wf-btn--primary"
        :disabled="!confirmedVersionId || running"
        @click="runTest"
      >
        {{ running ? t.workflows.test.running : t.workflows.test.run }}
      </button>
    </div>

    <p v-if="!confirmedVersionId" class="wf-muted">
      {{ t.workflows.test.needConfirmed }}
    </p>

    <div v-if="report" class="wf-report">
      <p :class="report.passed ? 'wf-pass' : 'wf-fail'">
        {{ report.passed ? t.workflows.test.passed : t.workflows.test.failed }}
      </p>
      <p v-if="report.errorMessage" class="wf-error">{{ report.errorMessage }}</p>
      <h4>{{ t.workflows.test.steps }}</h4>
      <ul>
        <li v-for="step in report.steps" :key="step.stepId">
          {{ step.title }} — {{ step.status }}
        </li>
      </ul>
      <h4>{{ t.workflows.test.mocks }}</h4>
      <p>
        Hits: {{ report.mockHits.length }}, Misses:
        {{ report.mockMisses.length }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import type { WorkflowTestReport } from '@shared/workflows/deployment-target'

const props = defineProps<{
  workflowId: string
  snapshot: {
    workflow: { status: string; currentVersionId: string | null }
    versions: Array<{ id: string; versionNumber: number }>
  } | null
}>()

const { t } = useI18n()
const running = ref(false)
const report = ref<WorkflowTestReport | null>(null)

const confirmedVersionId = computed(() => {
  const status = props.snapshot?.workflow.status
  if (status !== 'confirmed' && status !== 'testing' && status !== 'deployed') {
    return null
  }
  return props.snapshot?.workflow.currentVersionId ?? props.snapshot?.versions[0]?.id
})

async function runTest() {
  if (!confirmedVersionId.value) return
  running.value = true
  try {
    report.value =
      (await window.ipcRendererChannel?.RunWorkflowTest?.invoke({
        workflowId: props.workflowId,
        versionId: confirmedVersionId.value,
      })) ?? null
  } finally {
    running.value = false
  }
}
</script>

<style scoped>
.wf-test {
  padding: 16px;
}
.wf-muted {
  color: var(--ui-text-muted);
}
.wf-report {
  margin-top: 16px;
}
.wf-pass {
  color: var(--ui-success);
  font-weight: 600;
}
.wf-fail,
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
