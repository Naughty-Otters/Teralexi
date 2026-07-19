<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="wp-dialog-backdrop"
      role="presentation"
      @click.self="onBackdropClick"
    >
      <div
        class="wp-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <h3 :id="titleId" class="wp-dialog-title">{{ dialogTitle }}</h3>

        <template v-if="phase === 'confirm'">
          <p class="wp-dialog-lead">
            Review what will be packaged and where it will be uploaded.
          </p>
          <label class="wp-field">
            <span>Site folder</span>
            <input
              class="wp-input"
              type="text"
              readonly
              :value="preview?.siteDir ?? ''"
            />
          </label>
          <div class="wp-field-row">
            <label class="wp-field">
              <span>Files to package</span>
              <input
                class="wp-input"
                type="text"
                readonly
                :value="fileCountLabel"
              />
            </label>
            <label class="wp-field">
              <span>Estimated size</span>
              <input
                class="wp-input"
                type="text"
                readonly
                :value="sizeLabel"
              />
            </label>
          </div>
          <label class="wp-field">
            <span>Files included</span>
            <div class="wp-file-list" tabindex="0">
              <ul v-if="(preview?.sampleFiles?.length ?? 0) > 0">
                <li
                  v-for="file in preview?.sampleFiles"
                  :key="file"
                  class="wp-file-list__item"
                >
                  {{ file }}
                </li>
              </ul>
              <p v-else class="wp-muted">No files listed.</p>
              <p
                v-if="(preview?.truncatedRemaining ?? 0) > 0"
                class="wp-muted wp-file-list__more"
              >
                …and {{ preview?.truncatedRemaining }} more
              </p>
            </div>
          </label>
          <label class="wp-field">
            <span>Publish target</span>
            <input
              class="wp-input"
              type="text"
              readonly
              :value="targetLabel"
            />
          </label>
          <div class="wp-dialog-actions">
            <button type="button" class="wp-btn" @click="emit('cancel')">
              Cancel
            </button>
            <button
              type="button"
              class="wp-btn wp-btn--primary"
              :disabled="!canConfirm"
              @click="emit('confirm')"
            >
              Publish
            </button>
          </div>
        </template>

        <template v-else-if="phase === 'publishing'">
          <p class="wp-dialog-lead" role="status">
            Packaging and uploading your site…
          </p>
          <div class="wp-dialog-actions">
            <button type="button" class="wp-btn" disabled>Publishing…</button>
          </div>
        </template>

        <template v-else-if="phase === 'result'">
          <template v-if="result?.ok">
            <p class="wp-dialog-lead wp-dialog-lead--success">
              Your site was published successfully.
            </p>
            <label class="wp-field">
              <span>Public URL</span>
              <div class="wp-url-row">
                <input
                  class="wp-input"
                  type="text"
                  readonly
                  :value="result.absoluteUrl ?? ''"
                />
                <button
                  type="button"
                  class="wp-btn"
                  :disabled="!result.absoluteUrl"
                  @click="copyUrl"
                >
                  {{ copied ? 'Copied' : 'Copy' }}
                </button>
                <button
                  type="button"
                  class="wp-btn wp-btn--primary"
                  :disabled="!result.absoluteUrl"
                  @click="openUrl"
                >
                  Open
                </button>
              </div>
            </label>
            <div class="wp-field-row">
              <label class="wp-field">
                <span>Upload HTTP status</span>
                <input
                  class="wp-input"
                  type="text"
                  readonly
                  :value="formatStatus(result.uploadStatus)"
                />
              </label>
              <label class="wp-field">
                <span>Verify HTTP status</span>
                <input
                  class="wp-input"
                  type="text"
                  readonly
                  :value="formatVerifyStatus(result.verifyStatus)"
                />
              </label>
            </div>
            <div class="wp-field-row">
              <label class="wp-field">
                <span>Files published</span>
                <input
                  class="wp-input"
                  type="text"
                  readonly
                  :value="
                    result.fileCount != null ? String(result.fileCount) : '—'
                  "
                />
              </label>
              <label class="wp-field">
                <span>Upload size</span>
                <input
                  class="wp-input"
                  type="text"
                  readonly
                  :value="
                    result.bytes != null ? formatBytes(result.bytes) : '—'
                  "
                />
              </label>
            </div>
          </template>
          <template v-else>
            <p class="wp-dialog-lead wp-dialog-lead--error">
              {{ result?.error || preview?.error || 'Publish failed.' }}
            </p>
            <label
              v-if="result?.uploadStatus != null"
              class="wp-field"
            >
              <span>HTTP status</span>
              <input
                class="wp-input"
                type="text"
                readonly
                :value="formatStatus(result.uploadStatus)"
              />
            </label>
          </template>
          <div class="wp-dialog-actions">
            <button
              type="button"
              class="wp-btn wp-btn--primary"
              @click="emit('close')"
            >
              Close
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPreviewResult,
} from '@shared/agent/skill-composer-toolbar'
import { openExternalUrl } from '@renderer/lib/open-external-url'
import { useSandboxPreviewSuppress } from '@renderer/views/agent-chat/sandboxPreviewSuppress'

export type WebsitePublishDialogPhase = 'confirm' | 'publishing' | 'result'

const props = defineProps<{
  open: boolean
  phase: WebsitePublishDialogPhase
  preview: SkillComposerToolbarPreviewResult | null
  result: SkillComposerToolbarInvokeResult | null
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
  close: []
}>()

const titleId = 'website-publish-dialog-title'
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

// Native report-panel WebContentsView ignores CSS z-index — hide it while open.
useSandboxPreviewSuppress(() => props.open)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      copied.value = false
      if (copiedTimer) {
        clearTimeout(copiedTimer)
        copiedTimer = null
      }
    }
  },
)

const dialogTitle = computed(() => {
  if (props.phase === 'result') {
    return props.result?.ok ? 'Published' : 'Publish failed'
  }
  if (props.phase === 'publishing') return 'Publishing…'
  return props.preview?.title?.trim() || 'Publish website'
})

const canConfirm = computed(
  () => props.phase === 'confirm' && Boolean(props.preview?.ok),
)

const fileCountLabel = computed(() => {
  const n = props.preview?.fileCount
  return n != null ? String(n) : '—'
})

const sizeLabel = computed(() => {
  const n = props.preview?.estimatedBytes
  return n != null ? formatBytes(n) : '—'
})

const targetLabel = computed(() => {
  const host = props.preview?.targetHost?.trim() ?? ''
  const path = props.preview?.uploadPath?.trim() ?? ''
  if (host && path) return `${host}/${path.replace(/^\//, '')}`
  return host || path || '—'
})

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatStatus(status: number | undefined): string {
  if (status == null) return '—'
  return String(status)
}

function formatVerifyStatus(status: number | undefined): string {
  if (status == null) return '—'
  if (status === 0) return '0 (request failed)'
  return String(status)
}

function onBackdropClick() {
  if (props.phase === 'publishing') return
  if (props.phase === 'result') {
    emit('close')
    return
  }
  emit('cancel')
}

async function copyUrl() {
  const url = props.result?.absoluteUrl?.trim()
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
      copiedTimer = null
    }, 1500)
  } catch {
    /* ignore clipboard failures */
  }
}

function openUrl() {
  const url = props.result?.absoluteUrl?.trim()
  if (url) openExternalUrl(url)
}
</script>

<style scoped>
.wp-dialog-backdrop {
  position: fixed;
  inset: 0;
  /* Above teleported menus (~10050) and report-panel DOM; title bar stays higher. */
  z-index: 20000;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 16px;
}
.wp-dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: min(85vh, 720px);
  overflow: auto;
  padding: 20px;
  border-radius: 12px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.wp-dialog-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
  font-weight: 600;
}
.wp-dialog-lead {
  margin: 0 0 16px;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  line-height: 1.45;
}
.wp-dialog-lead--success {
  color: var(--ui-success, #15803d);
}
.wp-dialog-lead--error {
  color: var(--ui-error, #b91c1c);
}
.wp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.875rem;
  min-width: 0;
}
.wp-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.wp-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  font: inherit;
  color: var(--ui-text);
}
.wp-file-list {
  max-height: 160px;
  overflow: auto;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
}
.wp-file-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.wp-file-list__item {
  padding: 2px 0;
  word-break: break-all;
}
.wp-file-list__more {
  margin: 6px 0 0;
}
.wp-muted {
  margin: 0;
  color: var(--ui-text-muted);
}
.wp-url-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.wp-url-row .wp-input {
  flex: 1;
  min-width: 0;
}
.wp-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.wp-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.wp-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.wp-btn--primary {
  background: var(--ui-primary);
  color: white;
  border-color: transparent;
}
@media (max-width: 520px) {
  .wp-field-row {
    grid-template-columns: 1fr;
  }
  .wp-url-row {
    flex-wrap: wrap;
  }
}
</style>
