<template>
  <span v-if="false" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed, onMounted, toRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { useWorkspaceStore } from '@store/workspace'
import { useWorkspaceGitStore } from '@store/workspace-git'
import { monacoLanguageFromPath } from '@shared/file-type/monaco-language'
import { useEditorLspSession } from '@renderer/components/code/monaco-lsp/useEditorLsp'
import { useEditorAiCompletion } from '@renderer/components/code/monaco-lsp/useEditorAiCompletion'

const props = defineProps<{
  editor: MonacoEditorNS.IStandaloneCodeEditor
  readOnly?: boolean
}>()

const gitStore = useWorkspaceGitStore()
const workspaceStore = useWorkspaceStore()
const {
  editorPath,
  editorContent,
  conversationId,
  workspacePath,
} = storeToRefs(gitStore)
const { activeWorkspacePath } = storeToRefs(workspaceStore)

const {
  controller,
  lspStatus,
  attachToEditor,
  formatActiveFile,
} = useEditorLspSession({
  conversationId,
  workspaceRoot: computed(
    () => activeWorkspacePath.value ?? workspacePath.value,
  ),
  editorPath,
  editorContent,
  onOpenFile: (relativePath) => {
    void gitStore.openFileInEditor(relativePath)
  },
})

const { attachAiCompletion } = useEditorAiCompletion({
  conversationId,
  editorPath,
  readOnly: toRef(props, 'readOnly'),
})

defineExpose({
  lspStatus,
  formatActiveFile,
})

function languageForPath(): string {
  return editorPath.value ? monacoLanguageFromPath(editorPath.value) : 'plaintext'
}

async function attachEditorServices(
  editor: MonacoEditorNS.IStandaloneCodeEditor,
): Promise<void> {
  const languageId = languageForPath()
  await attachToEditor(editor)
  await attachAiCompletion(editor, languageId)
}

onMounted(() => {
  void attachEditorServices(props.editor)
})

watch(
  () => props.editor,
  (editor) => {
    if (editor) void attachEditorServices(editor)
  },
)

watch(editorContent, (content) => {
  controller.updateContent(content, languageForPath())
})
</script>
