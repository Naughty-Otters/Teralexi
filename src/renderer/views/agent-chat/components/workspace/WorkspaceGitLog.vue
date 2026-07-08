<template>
  <div class="git-log">
    <div class="git-log-header">
      <span>Recent Commits</span>
      <button class="git-log-refresh" title="Refresh log" @click="emit('refresh')">
        <UIcon name="i-lucide-refresh-cw" :class="{ 'spin': loading }" style="width:12px;height:12px;" />
      </button>
    </div>
    <p v-if="error" class="git-log-error">{{ error }}</p>
    <p v-else-if="!commits.length && !loading" class="git-log-empty">No commits yet.</p>
    <div v-else class="git-log-list">
      <div v-for="c in commits" :key="c.hash" class="git-log-entry" :title="c.subject">
        <span class="git-log-hash">{{ c.shortHash }}</span>
        <span class="git-log-msg">{{ c.subject }}</span>
        <span class="git-log-author">{{ c.author }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useWorkspaceGitStore } from '@store/workspace-git'

const gitStore = useWorkspaceGitStore()
const { commits, logLoading: loading, logError: error } = storeToRefs(gitStore)

const emit = defineEmits<{ refresh: [] }>()
</script>

<style scoped>
.git-log { display: flex; flex-direction: column; }
.git-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
}
.git-log-refresh { border: none; background: transparent; cursor: pointer; padding: 2px; color: var(--ui-text-muted); border-radius: 4px; }
.git-log-refresh:hover { color: var(--ui-text); }
.git-log-error, .git-log-empty { font-size: var(--app-font-size-secondary); color: var(--ui-text-muted); margin: 8px 10px; }
.git-log-list { overflow-y: auto; max-height: 200px; }
.git-log-entry {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  font-size: var(--app-font-size-secondary);
  font-family: var(--app-font-family);
  border-bottom: 1px solid var(--ui-border);
}
.git-log-entry:last-child { border-bottom: none; }
.git-log-hash { flex-shrink: 0; color: var(--color-primary-500, #6366f1); font-weight: 600; }
.git-log-msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ui-text); }
.git-log-author { flex-shrink: 0; color: var(--ui-text-muted); font-size: var(--app-font-size-sm); }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
