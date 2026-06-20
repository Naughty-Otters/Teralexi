<template>
  <div class="sap-root">
    <p class="sap-hint">{{ p.skills.attachmentsHint }}</p>

    <div v-if="loading" class="sap-empty">{{ p.skills.attachmentsLoading }}</div>
    <div v-else-if="loadError" class="sap-empty sap-empty--error">
      {{ loadError }}
    </div>
    <div v-else-if="attachments.length === 0" class="sap-empty">
      {{ p.skills.noAttachments }}
    </div>

    <div v-else class="sap-groups">
      <section
        v-for="group in grouped"
        :key="group.category"
        class="sap-group"
      >
        <h4 class="sap-group-title">{{ group.label }}</h4>
        <ul class="sap-list">
          <li v-for="file in group.files" :key="file.relativePath" class="sap-row">
            <span class="sap-file-meta">
              <span class="sap-file-name" :title="file.relativePath">{{
                file.fileName
              }}</span>
              <span class="sap-file-sub">
                {{ formatSize(file.sizeBytes) }}
                <span v-if="file.source === 'user'" class="sap-badge">user</span>
              </span>
            </span>
            <button
              type="button"
              class="sap-dl-btn"
              :disabled="downloadingPath === file.relativePath"
              @click="download(file)"
            >
              {{
                downloadingPath === file.relativePath
                  ? p.skills.downloading
                  : p.skills.download
              }}
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const p = computed(() => t.value.settings.panels)

type AttachmentCategory = 'ref' | 'script' | 'form'

type SkillAttachmentRow = {
  category: AttachmentCategory
  relativePath: string
  fileName: string
  source: 'bundled' | 'user'
  sizeBytes: number
}

const CATEGORY_LABELS = computed(
  (): Record<AttachmentCategory, string> => p.value.skills.attachmentCategories,
)

const CATEGORY_ORDER: AttachmentCategory[] = ['ref', 'script', 'form']

const props = defineProps<{
  skillId: string
}>()

const loading = ref(true)
const loadError = ref<string | null>(null)
const attachments = ref<SkillAttachmentRow[]>([])
const downloadingPath = ref<string | null>(null)

const grouped = computed(() => {
  const byCat = new Map<AttachmentCategory, SkillAttachmentRow[]>()
  for (const row of attachments.value) {
    const list = byCat.get(row.category) ?? []
    list.push(row)
    byCat.set(row.category, list)
  }
  return CATEGORY_ORDER.filter((c) => (byCat.get(c)?.length ?? 0) > 0).map(
    (category) => ({
      category,
      label: CATEGORY_LABELS.value[category],
      files: byCat.get(category) ?? [],
    }),
  )
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function loadAttachments(): Promise<void> {
  const id = props.skillId.trim()
  if (!id) {
    attachments.value = []
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = null
  const channel = window.ipcRendererChannel?.ListSkillAttachments
  if (!channel?.invoke) {
    loading.value = false
    loadError.value = 'Attachments unavailable outside the app.'
    return
  }

  try {
    attachments.value = (await channel.invoke({ skillId: id })) as SkillAttachmentRow[]
  } catch (err) {
    attachments.value = []
    loadError.value =
      err instanceof Error ? err.message : 'Failed to load attachments'
  } finally {
    loading.value = false
  }
}

async function download(file: SkillAttachmentRow): Promise<void> {
  const readChannel = window.ipcRendererChannel?.ReadSkillAttachment
  if (!readChannel?.invoke) return

  downloadingPath.value = file.relativePath
  try {
    const result = (await readChannel.invoke({
      skillId: props.skillId,
      relativePath: file.relativePath,
    })) as { content: string; encoding: 'utf8' | 'base64'; mimeType: string }

    let blob: Blob
    if (result.encoding === 'base64') {
      const binary = atob(result.content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      blob = new Blob([bytes], { type: result.mimeType })
    } else {
      blob = new Blob([result.content], {
        type: result.mimeType || 'text/plain',
      })
    }

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.fileName
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : 'Failed to download file'
  } finally {
    downloadingPath.value = null
  }
}

onMounted(loadAttachments)
watch(() => props.skillId, loadAttachments)
</script>

<style scoped>
.sap-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}

.sap-hint {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.45;
}

.sap-empty {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.sap-empty--error {
  color: var(--color-error-600, #c62828);
}

.sap-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sap-group-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.sap-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
}

.sap-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
}

.sap-row:last-child {
  border-bottom: none;
}

.sap-file-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sap-file-name {
  font-size: 13px;
  color: var(--ui-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sap-file-sub {
  font-size: 11px;
  color: var(--ui-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sap-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ui-bg-accented);
  color: var(--color-primary-600);
}

.sap-dl-btn {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  cursor: pointer;
}

.sap-dl-btn:hover:not(:disabled) {
  border-color: var(--color-primary-500);
  color: var(--color-primary-600);
}

.sap-dl-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
