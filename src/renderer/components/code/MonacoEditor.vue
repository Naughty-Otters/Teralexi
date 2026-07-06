<template>
  <div ref="hostEl" class="monaco-editor-host" />
</template>

<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useAppIsDark } from '@renderer/composables/appColorMode'
import { appFontFamily, appFontSize } from '@renderer/fontSettings'
import { monaco } from './monaco-setup'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    readOnly?: boolean
    filePath?: string | null
    tabSize?: number
    insertSpaces?: boolean
  }>(),
  {
    language: 'plaintext',
    readOnly: false,
    filePath: null,
    tabSize: 2,
    insertSpaces: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  ready: [editor: monaco.editor.IStandaloneCodeEditor]
}>()

const hostEl = ref<HTMLElement | null>(null)
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const isDark = useAppIsDark()

const MONACO_THEME_LIGHT = 'teralexi-vs'
const MONACO_THEME_DARK = 'teralexi-vs-dark'

let customThemesDefined = false

function ensureMonacoThemes() {
  if (customThemesDefined) return
  monaco.editor.defineTheme(MONACO_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {},
  })
  monaco.editor.defineTheme(MONACO_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
    },
  })
  customThemesDefined = true
}

function currentThemeName(): string {
  return isDark.value ? MONACO_THEME_DARK : MONACO_THEME_LIGHT
}

function applyTheme() {
  ensureMonacoThemes()
  monaco.editor.setTheme(currentThemeName())
}

function syncLanguage(language: string) {
  const instance = editor.value
  if (!instance) return
  const model = instance.getModel()
  if (!model) return
  monaco.editor.setModelLanguage(model, language || 'plaintext')
}

function editorFontOptions() {
  return {
    fontFamily: appFontFamily.value,
    fontSize: appFontSize.value,
    tabSize: props.tabSize,
    insertSpaces: props.insertSpaces,
  }
}

function syncEditorFontOptions() {
  editor.value?.updateOptions(editorFontOptions())
}

onMounted(() => {
  if (!hostEl.value) return

  try {
    applyTheme()

    const instance = monaco.editor.create(hostEl.value, {
      value: props.modelValue,
      language: props.language,
      theme: currentThemeName(),
      automaticLayout: true,
      minimap: { enabled: false },
      ...editorFontOptions(),
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      readOnly: props.readOnly,
      wordWrap: 'on',
      padding: { top: 8, bottom: 8 },
      renderWhitespace: 'selection',
    })

    instance.onDidChangeModelContent(() => {
      emit('update:modelValue', instance.getValue())
    })

    editor.value = instance
    emit('ready', instance)
  } catch (err) {
    console.error('[MonacoEditor] failed to create editor', err)
  }
})

onBeforeUnmount(() => {
  editor.value?.dispose()
  editor.value = null
})

watch(
  () => props.modelValue,
  (value) => {
    const instance = editor.value
    if (!instance) return
    if (value !== instance.getValue()) {
      instance.setValue(value)
    }
  },
)

watch(
  () => props.language,
  (language) => {
    syncLanguage(language ?? 'plaintext')
  },
)

watch(
  () => props.readOnly,
  (readOnly) => {
    editor.value?.updateOptions({ readOnly })
  },
)

watch(
  () => [props.tabSize, props.insertSpaces] as const,
  () => {
    syncEditorFontOptions()
  },
)

watch(isDark, () => {
  applyTheme()
})

watch([appFontFamily, appFontSize], () => {
  syncEditorFontOptions()
})

defineExpose({
  focus() {
    editor.value?.focus()
  },
  getEditor() {
    return editor.value
  },
})
</script>

<style scoped>
.monaco-editor-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
