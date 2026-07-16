<template>
  <div class="file-tree">
    <div class="file-tree-header">
      <span>File browser</span>
      <div class="file-tree-header-actions">
        <button
          class="file-tree-refresh"
          :class="{ 'file-tree-action--active': consoleOpen }"
          :title="
            consoleOpen ? 'Hide terminal console' : 'Show terminal console'
          "
          :aria-label="
            consoleOpen ? 'Hide terminal console' : 'Show terminal console'
          "
          @click="emit('toggle-console')"
        >
          <UIcon name="i-lucide-terminal" style="width: 12px; height: 12px" />
        </button>
        <button
          class="file-tree-refresh"
          title="Refresh files, git status, and editor"
          aria-label="Refresh files, git status, and editor"
          @click="emit('refresh')"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            :class="{ spin: loading }"
            style="width: 12px; height: 12px"
          />
        </button>
      </div>
    </div>

    <div class="file-tree-path" aria-label="Current folder">
      <button
        v-if="currentDir !== '.'"
        type="button"
        class="file-tree-up"
        title="Parent folder"
        aria-label="Parent folder"
        @click="goUp"
      >
        <UIcon name="i-lucide-chevron-left" class="file-tree-up-icon" />
      </button>
      <nav class="file-tree-breadcrumb">
        <button
          type="button"
          class="file-tree-crumb"
          title="Workspace root"
          aria-label="Workspace root"
          @click="goTo('.')"
        >
          ~
        </button>
        <template v-for="(segment, index) in pathSegments" :key="index">
          <span class="file-tree-crumb-sep" aria-hidden="true">/</span>
          <button
            type="button"
            class="file-tree-crumb"
            :title="crumbPath(index)"
            @click="goTo(crumbPath(index))"
          >
            {{ segment }}
          </button>
        </template>
      </nav>
    </div>

    <p v-if="error" class="file-tree-msg">{{ error }}</p>
    <p
      v-else-if="!sortedEntries.length && !loading"
      class="file-tree-msg file-tree-msg--muted"
    >
      Empty folder.
    </p>
    <div v-else class="file-tree-list">
      <template v-for="row in visibleRows" :key="row.key">
        <button
          v-if="row.kind === 'entry'"
          :ref="(el) => setRowRef(row.entry.path, el)"
          type="button"
          class="file-tree-row"
          :class="{
            'file-tree-row--highlight':
              isHighlighted(row.entry.path) ||
              editorPath === row.entry.path.replace(/\\/g, '/'),
            'file-tree-row--dir': row.entry.isDir,
            'file-tree-row--expanded':
              row.entry.isDir && isExpanded(row.entry.path),
          }"
          :title="row.entry.path"
          :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
          @click="onOpen(row.entry)"
        >
          <UIcon
            v-if="row.entry.isDir"
            :name="
              isExpanded(row.entry.path)
                ? 'i-lucide-folder-open'
                : 'i-lucide-folder'
            "
            class="file-tree-icon"
            :class="{ 'file-tree-icon--dir': row.entry.isDir }"
          />
          <AttachmentFileTypeIcon
            v-else
            :path="row.entry.path"
            class="file-tree-icon file-tree-icon--typed"
          />
          <span class="file-tree-name" :class="fileTypeNameClass(row.entry)">
            {{ row.entry.name }}
          </span>
          <span
            v-if="!row.entry.isDir"
            class="file-tree-kind"
            :class="fileTypeToneClass(row.entry.path)"
          >
            {{ fileTypeKindLabel(row.entry.path) }}
          </span>
          <UIcon
            v-if="row.entry.isDir"
            name="i-lucide-chevron-right"
            class="file-tree-chevron"
            :class="{
              'file-tree-chevron--expanded': isExpanded(row.entry.path),
            }"
            aria-hidden="true"
          />
          <span
            v-if="row.entry.gitStatus"
            class="file-tree-badge"
            :class="gitBadgeClass(row.entry.gitStatus)"
          >
            {{ row.entry.gitStatus.trim() }}
          </span>
        </button>

        <div
          v-else-if="row.kind === 'loading'"
          class="file-tree-state-row file-tree-state-row--loading"
          :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="file-tree-state-icon spin"
          />
          <span>Loading…</span>
        </div>

        <div
          v-else
          class="file-tree-state-row file-tree-state-row--error"
          :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
        >
          <UIcon name="i-lucide-alert-circle" class="file-tree-state-icon" />
          <span>{{ row.message }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceGitStore } from '@store/workspace-git'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import AttachmentFileTypeIcon from '../AttachmentFileTypeIcon.vue'
import {
  fileTypePresentationClass,
  resolveFileTypePresentation,
} from '@shared/file-type/file-type-presentation'
import type { GitFileEntry } from '@store/workspace-git'

const gitStore = useWorkspaceGitStore()
const navStore = useWorkspaceNavigationStore()
const {
  fileEntries: entries,
  filesDirectory: currentDir,
  filesLoading: loading,
  filesError: error,
  editorPath,
  consoleOpen,
  expandedFileTreeChildren: childEntriesByDir,
  expandedFileTreeLoading: childLoadingByDir,
  expandedFileTreeErrors: childErrorByDir,
} = storeToRefs(gitStore)
const { highlightPath } = storeToRefs(navStore)

const emit = defineEmits<{ refresh: []; 'toggle-console': [] }>()

const rowRefs = new Map<string, HTMLElement>()

type EntryTreeRow = {
  kind: 'entry'
  key: string
  depth: number
  entry: GitFileEntry
}

type LoadingTreeRow = {
  kind: 'loading'
  key: string
  depth: number
}

type ErrorTreeRow = {
  kind: 'error'
  key: string
  depth: number
  message: string
}

type TreeRow = EntryTreeRow | LoadingTreeRow | ErrorTreeRow

const pathSegments = computed(() => {
  if (currentDir.value === '.') return []
  return currentDir.value.split('/').filter(Boolean)
})

function sortEntries(items: readonly GitFileEntry[]): GitFileEntry[] {
  const dirs = items
    .filter((e) => e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name))
  const files = items
    .filter((e) => !e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

const sortedEntries = computed(() => sortEntries(entries.value))

const visibleRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []

  const appendRows = (items: readonly GitFileEntry[], depth: number) => {
    for (const entry of items) {
      rows.push({ kind: 'entry', key: entry.path, depth, entry })
      if (!entry.isDir || !isExpanded(entry.path)) continue

      if (childLoadingByDir.value[entry.path]) {
        rows.push({
          kind: 'loading',
          key: `${entry.path}::loading`,
          depth: depth + 1,
        })
      }

      const errorMessage = childErrorByDir.value[entry.path]
      if (errorMessage) {
        rows.push({
          kind: 'error',
          key: `${entry.path}::error`,
          depth: depth + 1,
          message: errorMessage,
        })
      }

      const children = childEntriesByDir.value[entry.path]
      if (children?.length) appendRows(children, depth + 1)
    }
  }

  appendRows(sortedEntries.value, 0)
  return rows
})

function crumbPath(index: number): string {
  return pathSegments.value.slice(0, index + 1).join('/')
}

function setRowRef(filePath: string, el: unknown) {
  if (el instanceof HTMLElement) rowRefs.set(filePath, el)
  else rowRefs.delete(filePath)
}

function isHighlighted(filePath: string): boolean {
  const target = highlightPath.value?.replace(/\\/g, '/')
  if (!target) return false
  return filePath.replace(/\\/g, '/') === target
}

function isExpanded(filePath: string): boolean {
  return gitStore.isFileTreeDirExpanded(filePath)
}

function fileTypeToneClass(filePath: string): string {
  return fileTypePresentationClass(resolveFileTypePresentation(filePath).tone)
}

function fileTypeKindLabel(filePath: string): string {
  return resolveFileTypePresentation(filePath).kindLabel
}

function fileTypeNameClass(entry: GitFileEntry): string | null {
  if (entry.isDir) return null
  return fileTypeToneClass(entry.path)
}

watch(currentDir, () => {
  rowRefs.clear()
})

watch(highlightPath, async (path) => {
  if (!path?.trim()) return
  await gitStore.navigateFilesToHighlight(path)
  await nextTick()
  const row = rowRefs.get(path.replace(/\\/g, '/'))
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

function gitBadgeClass(status: string) {
  const s = status.trim()
  if (s === 'M') return 'file-tree-badge--mod'
  if (s === 'A' || s === '??') return 'file-tree-badge--new'
  if (s === 'D') return 'file-tree-badge--del'
  return ''
}

function goTo(relativePath: string) {
  void gitStore.navigateFilesToDirectory(relativePath)
}

function goUp() {
  void gitStore.navigateFilesUp()
}

async function onOpen(entry: GitFileEntry) {
  if (entry.isDir) {
    await gitStore.toggleFileTreeDirectory(entry.path)
    return
  }
  navStore.clearHighlight()
  await gitStore.openFileInEditor(entry.path)
}
</script>

<style scoped>
@import '../../attachment-file-type.css';

.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--app-font-family);
  font-size: var(--app-font-size);
}
.file-tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: var(--wp-tab-strip-height, 38px);
  padding: 0 10px;
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  flex-shrink: 0;
}
.file-tree-refresh {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  color: var(--ui-text-muted);
  border-radius: 4px;
}
.file-tree-refresh:hover {
  color: var(--ui-text);
}

.file-tree-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.file-tree-action--active {
  color: var(--color-primary-500, #6366f1) !important;
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 18%,
    transparent
  );
  border-radius: 4px;
}

.file-tree-path {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
  flex-shrink: 0;
  min-width: 0;
}
.file-tree-up {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.file-tree-up:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
.file-tree-up-icon {
  width: 14px;
  height: 14px;
}
.file-tree-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  overflow-x: auto;
  font-size: var(--app-font-size);
  font-family: var(--app-font-family);
}
.file-tree-crumb {
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 3px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-crumb:hover {
  color: var(--color-primary-500, #6366f1);
  background: var(--ui-bg-elevated);
}
.file-tree-crumb-sep {
  color: var(--ui-text-muted);
  opacity: 0.6;
  flex-shrink: 0;
}

.file-tree-msg {
  font-size: var(--app-font-size-secondary);
  color: var(--ui-text-muted);
  margin: 8px 10px;
}
.file-tree-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.file-tree-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 4px 10px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: var(--app-font-size);
  color: var(--ui-text);
  font-family: inherit;
}
.file-tree-row:hover {
  background: var(--ui-bg-elevated);
}
.file-tree-row--dir .file-tree-name {
  font-weight: 500;
}
.file-tree-row--expanded .file-tree-icon--dir {
  color: var(--color-primary-500, #6366f1);
}
.file-tree-row--highlight {
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 14%,
    transparent
  );
  outline: 1px solid
    color-mix(in srgb, var(--color-primary-500, #6366f1) 35%, transparent);
}
.file-tree-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}
.file-tree-icon--dir {
  color: var(--color-primary-400, #818cf8);
}
.file-tree-icon--typed {
  width: 14px;
  height: 14px;
}
.file-tree-chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
  opacity: 0.55;
  transition: transform 0.16s ease;
}
.file-tree-chevron--expanded {
  transform: rotate(90deg);
}
.file-tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-name.file-type-presentation--default {
  color: var(--ui-text);
}
.file-tree-kind {
  flex-shrink: 0;
  font-size: var(--app-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 12%, transparent);
  opacity: 0.95;
}
.file-tree-row .file-tree-kind + .file-tree-badge {
  margin-left: 2px;
}
.file-tree-state-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: var(--app-font-size-sm);
  color: var(--ui-text-muted);
}
.file-tree-state-row--error {
  color: var(--color-error-600, #dc2626);
}
.file-tree-state-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}
.file-tree-badge {
  flex-shrink: 0;
  font-size: var(--app-font-size-xs);
  font-weight: 700;
  padding: 0 4px;
  border-radius: 3px;
  font-family: var(--app-font-family);
}
.file-tree-badge--mod {
  color: var(--color-warning-600, #d97706);
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 12%,
    transparent
  );
}
.file-tree-badge--new {
  color: var(--color-success-600, #16a34a);
  background: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 12%,
    transparent
  );
}
.file-tree-badge--del {
  color: var(--color-error-600, #dc2626);
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 12%,
    transparent
  );
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
