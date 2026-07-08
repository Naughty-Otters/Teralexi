<template>
  <div class="git-status">
    <!-- Branch bar -->
    <div class="git-branch-bar">
      <UIcon name="i-lucide-git-branch" class="git-branch-icon" />
      <span class="git-branch-name">{{ branch || '—' }}</span>
      <span v-if="upstream" class="git-upstream">→ {{ upstream }}</span>
      <span v-if="ahead > 0" class="git-ahead">↑{{ ahead }}</span>
      <span v-if="behind > 0" class="git-behind">↓{{ behind }}</span>
      <button class="git-refresh-btn" title="Refresh files and git status" :disabled="statusLoading" @click="emit('refresh')">
        <UIcon name="i-lucide-refresh-cw" :class="['git-refresh-icon', { 'git-refresh-icon--spin': statusLoading }]" />
      </button>
    </div>

    <!-- Error -->
    <p v-if="statusError" class="git-error">{{ statusError }}</p>

    <!-- Clean state -->
    <p v-else-if="isClean && !statusLoading" class="git-clean">
      <UIcon name="i-lucide-check-circle" class="git-clean-icon" />
      Working tree clean
    </p>

    <!-- File list -->
    <div v-else class="git-file-list">
      <!-- Staged -->
      <template v-if="stagedEntries.length > 0">
        <div class="git-section-header">
          <span>Staged ({{ stagedEntries.length }})</span>
          <button class="git-link-btn" @click="emit('show-diff', { staged: true })">View diff</button>
        </div>
        <div
          v-for="entry in stagedEntries"
          :key="'s-' + entry.path"
          class="git-file-row git-file-row--staged"
          @click="emit('show-diff', { staged: true, files: [entry.path] })"
        >
          <span class="git-file-code">{{ entry.index }}</span>
          <span class="git-file-path">{{ entry.path }}</span>
        </div>
      </template>

      <!-- Unstaged + untracked -->
      <template v-if="unstagedEntries.length > 0 || untrackedEntries.length > 0">
        <div class="git-section-header">
          <span>Changes ({{ unstagedEntries.length + untrackedEntries.length }})</span>
          <button
            class="git-link-btn"
            :disabled="mutationsDisabled"
            :title="mutationsDisabled ? busyTitle : undefined"
            @click="emit('stage-all')"
          >
            Stage all
          </button>
        </div>
        <div
          v-for="entry in [...unstagedEntries, ...untrackedEntries]"
          :key="'u-' + entry.path"
          class="git-file-row"
          @click="emit('show-diff', { staged: false, files: [entry.path] })"
        >
          <span class="git-file-code git-file-code--unstaged">{{ entry.worktree === ' ' ? entry.code : entry.worktree }}</span>
          <span class="git-file-path">{{ entry.path }}</span>
          <button
            class="git-stage-btn"
            :disabled="mutationsDisabled"
            :title="mutationsDisabled ? busyTitle : 'Stage this file'"
            @click.stop="emit('stage-files', [entry.path])"
          >+</button>
        </div>
      </template>
    </div>

    <!-- Commit form -->
    <div v-if="!isClean" class="git-commit-form">
      <textarea
        v-model="localMessage"
        class="git-commit-input"
        placeholder="Commit message…"
        rows="2"
        @keydown.ctrl.enter.prevent="onCommit"
        @keydown.meta.enter.prevent="onCommit"
      />
      <div class="git-commit-actions">
        <button
          class="git-btn git-btn--primary"
          :disabled="!localMessage.trim() || opLoading || mutationsDisabled"
          :title="mutationsDisabled ? busyTitle : undefined"
          @click="onCommit"
        >
          <UIcon name="i-lucide-git-commit-horizontal" />
          Commit
        </button>
        <button
          class="git-btn"
          :disabled="opLoading || !canPush || mutationsDisabled"
          :title="mutationsDisabled ? busyTitle : 'Push to remote'"
          @click="emit('push')"
        >
          <UIcon name="i-lucide-upload" />
          Push{{ ahead > 0 ? ` (${ahead})` : '' }}
        </button>
      </div>
      <p v-if="opError" class="git-op-error">{{ opError }}</p>
      <p v-if="opSuccess" class="git-op-success">{{ opSuccess }}</p>

      <details class="git-pr-section">
        <summary class="git-pr-summary">Create pull request</summary>
        <input
          v-model="localPrTitle"
          class="git-pr-input"
          type="text"
          placeholder="PR title…"
          :disabled="mutationsDisabled"
        />
        <textarea
          v-model="localPrBody"
          class="git-commit-input git-pr-body"
          placeholder="PR description (markdown)…"
          rows="3"
          :disabled="mutationsDisabled"
        />
        <button
          class="git-btn git-btn--primary"
          :disabled="!localPrTitle.trim() || opLoading || mutationsDisabled"
          :title="mutationsDisabled ? busyTitle : undefined"
          @click="onCreatePr"
        >
          <UIcon name="i-lucide-git-pull-request" />
          Create PR
        </button>
        <a
          v-if="lastPrUrl"
          :href="lastPrUrl"
          class="git-pr-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ lastPrUrl }}
        </a>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceGitStore } from '@store/workspace-git'

const gitStore = useWorkspaceGitStore()
const {
  branch,
  upstream,
  ahead,
  behind,
  statusLoading,
  statusError,
  isClean,
  stagedEntries,
  unstagedEntries,
  untrackedEntries,
  opLoading,
  opError,
  opSuccess,
  isMutationsDisabled,
  canPush,
  lastPrUrl,
} = storeToRefs(gitStore)

const mutationsDisabled = isMutationsDisabled
const busyTitle = 'Wait for the agent to finish'

const emit = defineEmits<{
  refresh: []
  'show-diff': [{ staged: boolean; files?: string[] }]
  'stage-all': []
  'stage-files': [string[]]
  push: []
}>()

const localMessage = ref('')
const localPrTitle = ref('')
const localPrBody = ref('')

watch(
  () => gitStore.commitMessage,
  (v) => {
    localMessage.value = v
  },
)
watch(
  () => gitStore.prTitle,
  (v) => {
    localPrTitle.value = v
  },
)
watch(
  () => gitStore.prBody,
  (v) => {
    localPrBody.value = v
  },
)

function onCommit() {
  if (mutationsDisabled.value || !localMessage.value.trim()) return
  gitStore.commitMessage = localMessage.value
  void gitStore.commit()
}

function onCreatePr() {
  if (mutationsDisabled.value || !localPrTitle.value.trim()) return
  gitStore.prTitle = localPrTitle.value
  gitStore.prBody = localPrBody.value
  void gitStore.createPR({
    title: localPrTitle.value.trim(),
    body: localPrBody.value,
  })
}
</script>

<style scoped>
.git-status { display: flex; flex-direction: column; gap: 0; height: 100%; overflow-y: auto; }
.git-branch-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
  font-size: var(--app-font-size-secondary);
  flex-shrink: 0;
}
.git-branch-icon { width: 13px; height: 13px; color: var(--ui-text-muted); flex-shrink: 0; }
.git-branch-name { font-weight: 600; color: var(--ui-text); }
.git-upstream { color: var(--ui-text-muted); font-size: var(--app-font-size-sm); }
.git-ahead { color: var(--color-success-600, #16a34a); font-size: var(--app-font-size-sm); font-weight: 600; }
.git-behind { color: var(--color-warning-600, #d97706); font-size: var(--app-font-size-sm); font-weight: 600; }
.git-refresh-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  color: var(--ui-text-muted);
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.git-refresh-btn:hover { color: var(--ui-text); background: var(--ui-bg-elevated); }
.git-refresh-icon { width: 13px; height: 13px; }
.git-refresh-icon--spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.git-error { margin: 8px 10px; font-size: var(--app-font-size-secondary); color: var(--color-error-600, #dc2626); }
.git-clean {
  display: flex; align-items: center; gap: 6px;
  margin: 12px 10px;
  font-size: var(--app-font-size-secondary);
  color: var(--ui-text-muted);
}
.git-clean-icon { width: 14px; height: 14px; color: var(--color-success-500, #22c55e); }

.git-file-list { flex: 1; overflow-y: auto; }
.git-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px 3px;
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--ui-bg-elevated, var(--ui-bg));
  border-bottom: 1px solid var(--ui-border);
  position: sticky;
  top: 0;
}
.git-link-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-primary-500, #6366f1);
  font-size: var(--app-font-size-sm);
  padding: 0;
}
.git-link-btn:hover { text-decoration: underline; }

.git-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  font-size: var(--app-font-size-secondary);
  cursor: pointer;
  font-family: var(--app-font-family);
}
.git-file-row:hover { background: var(--ui-bg-elevated, rgba(0,0,0,0.04)); }
.git-file-code {
  width: 14px;
  flex-shrink: 0;
  font-weight: 700;
  color: var(--color-success-600, #16a34a);
}
.git-file-code--unstaged { color: var(--color-warning-600, #d97706); }
.git-file-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ui-text); }
.git-stage-btn {
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid var(--ui-border);
  background: transparent;
  cursor: pointer;
  font-size: var(--app-font-size);
  font-weight: 700;
  color: var(--color-success-600, #16a34a);
  border-radius: 3px;
  line-height: 1;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.1s;
}
.git-file-row:hover .git-stage-btn { opacity: 1; }

.git-commit-form {
  border-top: 1px solid var(--ui-border);
  padding: 8px 10px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.git-commit-input {
  width: 100%;
  resize: none;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: var(--app-font-size-secondary);
  font-family: inherit;
  background: var(--ui-bg);
  color: var(--ui-text);
  outline: none;
  box-sizing: border-box;
}
.git-commit-input:focus { border-color: var(--color-primary-400, #818cf8); }
.git-commit-actions { display: flex; gap: 6px; }
.git-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: var(--app-font-size-secondary);
  cursor: pointer;
  transition: background 0.12s;
}
.git-btn:hover:not(:disabled) { background: var(--ui-bg-elevated); }
.git-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.git-btn--primary {
  background: var(--color-primary-500, #6366f1);
  color: #fff;
  border-color: transparent;
}
.git-btn--primary:hover:not(:disabled) { background: var(--color-primary-600, #4f46e5); }
.git-op-error { margin: 0; font-size: var(--app-font-size-sm); color: var(--color-error-600, #dc2626); }
.git-op-success { margin: 0; font-size: var(--app-font-size-sm); color: var(--color-success-600, #16a34a); }

.git-pr-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--ui-border);
}
.git-pr-summary {
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  color: var(--ui-text-muted);
  cursor: pointer;
  margin-bottom: 6px;
}
.git-pr-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: var(--app-font-size-secondary);
  margin-bottom: 6px;
  background: var(--ui-bg);
  color: var(--ui-text);
}
.git-pr-body { margin-bottom: 6px; }
.git-pr-link {
  display: block;
  margin-top: 6px;
  font-size: var(--app-font-size-sm);
  color: var(--color-primary-500, #6366f1);
  word-break: break-all;
}
.git-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: none;
}
</style>
