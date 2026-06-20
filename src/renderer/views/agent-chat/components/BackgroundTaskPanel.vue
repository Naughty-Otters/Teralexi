<template>
  <div v-if="tasks.length > 0" class="bg-tasks" role="region" aria-label="Background tasks">
    <p class="bg-tasks__title">Background tasks</p>
    <ul class="bg-tasks__list">
      <li v-for="task in tasks" :key="task.id" class="bg-tasks__item">
        <div class="bg-tasks__head">
          <span class="bg-tasks__label">{{ task.label }}</span>
          <span class="bg-tasks__status" :data-status="task.status">{{ task.status }}</span>
          <button
            v-if="task.status === 'running'"
            type="button"
            class="bg-tasks__cancel"
            aria-label="Cancel task"
            @click="emit('cancel', task.id)"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>
        <pre v-if="task.output" class="bg-tasks__output">{{ truncated(task.output) }}</pre>
        <p v-if="task.error" class="bg-tasks__error">{{ task.error }}</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
export type BackgroundTaskView = {
  id: string
  label: string
  status: string
  output: string
  error?: string
}

defineProps<{ tasks: BackgroundTaskView[] }>()

const emit = defineEmits<{ cancel: [taskId: string] }>()

function truncated(text: string, max = 1200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<style scoped>
.bg-tasks {
  margin: 8px 12px 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-text) 3%, transparent);
}
.bg-tasks__title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}
.bg-tasks__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bg-tasks__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bg-tasks__label {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bg-tasks__status {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
.bg-tasks__status[data-status='running'] {
  color: var(--color-primary-600, var(--ui-text));
}
.bg-tasks__status[data-status='failed'] {
  color: var(--color-error-600, #dc2626);
}
.bg-tasks__cancel {
  display: inline-flex;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}
.bg-tasks__output {
  margin: 6px 0 0;
  padding: 8px;
  max-height: 120px;
  overflow: auto;
  font-size: 10px;
  line-height: 1.4;
  font-family: var(--app-font-family);
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-text) 5%, transparent);
}
.bg-tasks__error {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--color-error-600, #dc2626);
}
</style>
