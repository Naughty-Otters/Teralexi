<template>
  <div v-if="props.links.length" class="step-output-links">
    <ul class="step-output-links__list">
      <li
        v-for="link in props.links"
        :key="link.url"
        class="step-output-link-card"
        :class="{ 'step-output-link-card--office': isOfficeLink(link.url) }"
      >
        <!-- Office document card -->
        <template v-if="isOfficeLink(link.url)">
          <div class="office-card">
            <span class="office-card__icon" aria-hidden="true">{{ officeIcon(link.url) }}</span>
            <div class="office-card__body">
              <span class="office-card__label">{{ link.label }}</span>
              <span class="office-card__type">{{ officeType(link.url) }}</span>
            </div>
            <div class="office-card__actions">
              <button
                class="office-card__btn"
                title="Open in default app"
                @click="openInDefaultApp(link.url)"
              >
                Open
              </button>
              <button
                class="office-card__btn office-card__btn--secondary"
                title="Save As…"
                @click="saveAs(link.url, link.label)"
              >
                Save As
              </button>
            </div>
          </div>
        </template>

        <!-- Standard preview card (image / HTML / PDF) -->
        <template v-else>
          <a
            :href="link.url"
            class="sandbox-preview-link step-output-link-card__label"
            @click.prevent="emit('open', link.url)"
          >
            {{ link.label }}
          </a>
          <a
            v-if="!stateFor(link.url)?.error"
            :href="link.url"
            class="sandbox-preview-link step-output-link-preview"
            :class="{
              'step-output-link-preview--loading': stateFor(link.url)?.loading,
            }"
            :aria-label="`Open preview for ${link.label}`"
            @click.prevent="emit('open', link.url)"
          >
            <img
              v-if="stateFor(link.url)?.dataUrl"
              :src="stateFor(link.url)!.dataUrl"
              alt=""
              class="step-output-link-preview__img"
              loading="lazy"
            />
            <span
              v-else-if="stateFor(link.url)?.loading"
              class="step-output-link-preview__status"
            >
              Loading preview…
            </span>
          </a>
        </template>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue'
import {
  fetchStepOutputLinkPreview,
  getStepOutputLinkPreview,
} from '../stepOutputLinkPreview'
import type { StepOutputLinkView } from '../stepOutputLinksRender'

const OFFICE_EXTENSIONS = new Set(['.xlsx', '.xls', '.pptx', '.ppt', '.docx', '.doc', '.csv'])

const OFFICE_ICONS: Record<string, string> = {
  '.xlsx': '📊', '.xls': '📊',
  '.pptx': '📽️', '.ppt': '📽️',
  '.docx': '📝', '.doc': '📝',
  '.csv': '📋',
}

const OFFICE_TYPES: Record<string, string> = {
  '.xlsx': 'Excel Spreadsheet', '.xls': 'Excel Spreadsheet',
  '.pptx': 'PowerPoint Presentation', '.ppt': 'PowerPoint Presentation',
  '.docx': 'Word Document', '.doc': 'Word Document',
  '.csv': 'CSV File',
}

function fileExt(url: string): string {
  const path = url.split('?')[0]
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

function isOfficeLink(url: string): boolean {
  return OFFICE_EXTENSIONS.has(fileExt(url))
}

function officeIcon(url: string): string {
  return OFFICE_ICONS[fileExt(url)] ?? '📄'
}

function officeType(url: string): string {
  return OFFICE_TYPES[fileExt(url)] ?? 'Document'
}

async function openInDefaultApp(url: string): Promise<void> {
  const result = await window.ipcRendererChannel?.OpenFileInDefaultApp?.invoke?.({ path: url })
  if (result && !result.success) {
    console.error('OpenFileInDefaultApp failed:', result.error)
  }
}

async function saveAs(url: string, label: string): Promise<void> {
  // Extract filename from the file:// URL or label
  const urlPath = url.startsWith('file://') ? decodeURIComponent(url.slice(7)) : url
  const filename = urlPath.split('/').pop() ?? label
  await window.ipcRendererChannel?.SaveFileAs?.invoke?.({
    sourcePath: url,
    defaultName: filename,
  })
}

const props = defineProps<{
  links: readonly StepOutputLinkView[]
}>()

const emit = defineEmits<{
  open: [url: string]
}>()

const previewState = reactive<
  Record<string, ReturnType<typeof getStepOutputLinkPreview>>
>({})

function stateFor(url: string) {
  return previewState[url] ?? getStepOutputLinkPreview(url)
}

async function loadPreviews(urls: string[]) {
  // Only load previews for non-office files
  const previewUrls = urls.filter((u) => !isOfficeLink(u))
  await Promise.all(
    previewUrls.map(async (url) => {
      const state = await fetchStepOutputLinkPreview(url)
      previewState[url] = state
    }),
  )
}

onMounted(() => {
  void loadPreviews(props.links.map((l) => l.url))
})

watch(
  () => props.links.map((l) => l.url).join('\0'),
  () => {
    void loadPreviews(props.links.map((l) => l.url))
  },
)
</script>

<style scoped>
@import '../step-output-links.css';

/* ── Office document card ────────────────────────────────────────────────── */
.step-output-link-card--office {
  width: 100%;
}

.office-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated, var(--ui-bg));
  min-width: 0;
}

.office-card__icon {
  font-size: 24px;
  flex-shrink: 0;
  line-height: 1;
}

.office-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.office-card__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.office-card__type {
  font-size: 11px;
  color: var(--ui-text-muted);
}

.office-card__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.office-card__btn {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--ui-border);
  background: var(--color-primary-500, #6366f1);
  color: #fff;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.office-card__btn:hover {
  opacity: 0.85;
}

.office-card__btn--secondary {
  background: transparent;
  color: var(--ui-text-muted);
  border-color: var(--ui-border);
}

.office-card__btn--secondary:hover {
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 6%, transparent);
}
</style>
