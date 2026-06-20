<template>
  <div class="todo-checklist">
    <div class="todo-header">
      <UIcon name="i-lucide-list-checks" class="todo-header-icon" />
      <span class="todo-header-title">Tasks</span>
      <span class="todo-progress">{{ summary.completed }}/{{ actionable }}</span>
    </div>
    <ul class="todo-list">
      <li
        v-for="todo in todos"
        :key="todo.id"
        class="todo-item"
        :class="`todo-item--${todo.status}`"
      >
        <UIcon :name="statusIcon(todo.status)" class="todo-icon" />
        <div class="todo-body">
          <span class="todo-content">{{ todo.content }}</span>
          <span v-if="todo.success_criteria" class="todo-meta">
            Success: {{ todo.success_criteria }}
          </span>
          <code v-if="todo.verify_command" class="todo-meta todo-command">{{
            todo.verify_command
          }}</code>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TrackedTodo, TrackedTodoStatus } from '@shared/agent/todos'

const props = defineProps<{ todos: TrackedTodo[] }>()

const summary = computed(() => {
  let completed = 0
  let cancelled = 0
  for (const t of props.todos) {
    if (t.status === 'completed') completed++
    else if (t.status === 'cancelled') cancelled++
  }
  return { completed, cancelled }
})

const actionable = computed(() => props.todos.length - summary.value.cancelled)

function statusIcon(status: TrackedTodoStatus): string {
  switch (status) {
    case 'completed':
      return 'i-lucide-check-circle-2'
    case 'in_progress':
      return 'i-lucide-loader-circle'
    case 'cancelled':
      return 'i-lucide-circle-slash'
    default:
      return 'i-lucide-circle'
  }
}
</script>

<style scoped>
.todo-checklist {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  overflow: hidden;
  font-size: 13px;
}
.todo-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
}
.todo-header-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary-500, #6366f1);
  flex-shrink: 0;
}
.todo-header-title {
  font-weight: 600;
  color: var(--ui-text);
}
.todo-progress {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}
.todo-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 10px;
  line-height: 1.4;
}
.todo-icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}
.todo-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.todo-content {
  min-width: 0;
  color: var(--ui-text);
}
.todo-meta {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.35;
}
.todo-command {
  font-family: var(--app-font-family);
  font-size: 10px;
  word-break: break-all;
}
.todo-item--completed .todo-icon {
  color: var(--color-success-500, #22c55e);
}
.todo-item--completed .todo-content {
  color: var(--ui-text-muted);
  text-decoration: line-through;
}
.todo-item--in_progress .todo-icon {
  color: var(--color-primary-500, #6366f1);
  animation: todo-spin 1.4s linear infinite;
}
.todo-item--in_progress .todo-content {
  color: var(--ui-text);
  font-weight: 500;
}
.todo-item--cancelled .todo-content {
  color: var(--ui-text-muted);
  text-decoration: line-through;
  opacity: 0.7;
}
@keyframes todo-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
