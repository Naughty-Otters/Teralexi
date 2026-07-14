<template>
  <section class="xterm-console" aria-label="Workspace terminal console">
    <div class="xterm-console-header">
      <div class="xterm-console-title">
        <UIcon name="i-lucide-terminal" style="width: 13px; height: 13px" />
        <span>Terminal Console</span>
        <span class="xterm-console-running">
          {{ sessionCwd || filesDirectory }}
        </span>
      </div>
      <div class="xterm-console-actions">
        <button
          type="button"
          class="xterm-console-btn"
          title="Clear terminal"
          aria-label="Clear terminal"
          @click="onClear"
        >
          <UIcon name="i-lucide-eraser" style="width: 12px; height: 12px" />
        </button>
        <button
          type="button"
          class="xterm-console-btn"
          title="Keyboard break (Ctrl+C)"
          aria-label="Keyboard break (Ctrl+C)"
          @click="sendBreak"
        >
          <UIcon name="i-lucide-hand" style="width: 12px; height: 12px" />
        </button>
        <button
          type="button"
          class="xterm-console-btn"
          title="Close terminal console"
          aria-label="Close terminal console"
          @click="onClose"
        >
          <UIcon
            name="i-lucide-chevrons-down"
            style="width: 12px; height: 12px"
          />
        </button>
      </div>
    </div>

    <div ref="terminalEl" class="xterm-console-body" />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { appFontFamily, appFontSize } from '@renderer/fontSettings'
import { useWorkspaceGitStore } from '@store/workspace-git'

const gitStore = useWorkspaceGitStore()
const { filesDirectory, conversationId } = storeToRefs(gitStore)

const terminalEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
const sessionCwd = ref('')

async function startSession() {
  const cid = conversationId.value?.trim()
  if (!cid) return
  const cols = Math.max(term?.cols ?? 100, 20)
  const rows = Math.max(term?.rows ?? 30, 8)
  const result =
    await window.ipcRendererChannel?.StartWorkspaceTerminalSession?.invoke?.({
      conversationId: cid,
      relativeCwd: filesDirectory.value,
      shell: null,
      cols,
      rows,
    })
  if (!result?.ok) {
    term?.write(
      `\r\n[failed to start shell: ${result?.error ?? 'unknown error'}]\r\n`,
    )
    return
  }
  if (result.cwd) sessionCwd.value = result.cwd
}

function sendBreak() {
  const cid = conversationId.value?.trim()
  if (!cid) return
  void window.ipcRendererChannel?.WriteWorkspaceTerminalInput?.invoke?.({
    conversationId: cid,
    data: '\u0003',
  })
}

function onClose() {
  gitStore.toggleConsole(false)
}

function onClear() {
  if (!term) return
  term.reset()
}

function syncTerminalFontOptions() {
  if (!term) return
  term.options.fontFamily = appFontFamily.value
  term.options.fontSize = appFontSize.value
  fitAddon?.fit()
}

onMounted(async () => {
  if (!terminalEl.value) return

  fitAddon = new FitAddon()
  term = new Terminal({
    fontFamily: appFontFamily.value,
    fontSize: appFontSize.value,
    cursorBlink: true,
    convertEol: true,
  })

  term.loadAddon(fitAddon)
  term.open(terminalEl.value)
  await nextTick()
  fitAddon.fit()

  term.onData((data) => {
    const cid = conversationId.value?.trim()
    if (!cid) return
    void window.ipcRendererChannel?.WriteWorkspaceTerminalInput?.invoke?.({
      conversationId: cid,
      data,
    })
  })

  const onData = (
    _event: Electron.IpcRendererEvent,
    payload: { conversationId: string; data: string },
  ) => {
    if (
      !conversationId.value ||
      payload.conversationId !== conversationId.value
    )
      return
    term?.write(payload.data)
  }
  const onStarted = (
    _event: Electron.IpcRendererEvent,
    payload: { conversationId: string; cwd: string; shell: string },
  ) => {
    if (
      !conversationId.value ||
      payload.conversationId !== conversationId.value
    )
      return
    sessionCwd.value = payload.cwd
  }
  const onExit = (
    _event: Electron.IpcRendererEvent,
    payload: { conversationId: string; exitCode: number },
  ) => {
    if (
      !conversationId.value ||
      payload.conversationId !== conversationId.value
    )
      return
    const cid = payload.conversationId
    void window.ipcRendererChannel?.StopWorkspaceTerminalSession?.invoke?.({
      conversationId: cid,
    })
    gitStore.toggleConsole(false)
  }

  window.ipcRendererChannel?.WorkspaceTerminalData?.on?.(onData)
  window.ipcRendererChannel?.WorkspaceTerminalStarted?.on?.(onStarted)
  window.ipcRendererChannel?.WorkspaceTerminalExit?.on?.(onExit)
  ;(term as any).__workspaceOnData = onData
  ;(term as any).__workspaceOnStarted = onStarted
  ;(term as any).__workspaceOnExit = onExit

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
    const cid = conversationId.value?.trim()
    if (!cid || !term) return
    void window.ipcRendererChannel?.ResizeWorkspaceTerminalSession?.invoke?.({
      conversationId: cid,
      cols: term.cols,
      rows: term.rows,
    })
  })
  resizeObserver.observe(terminalEl.value)

  await startSession()
})

watch([appFontFamily, appFontSize], () => {
  syncTerminalFontOptions()
})

onBeforeUnmount(() => {
  const onData = (term as any)?.__workspaceOnData
  const onStarted = (term as any)?.__workspaceOnStarted
  const onExit = (term as any)?.__workspaceOnExit
  if (onData)
    window.ipcRendererChannel?.WorkspaceTerminalData?.removeListener?.(onData)
  if (onStarted)
    window.ipcRendererChannel?.WorkspaceTerminalStarted?.removeListener?.(
      onStarted,
    )
  if (onExit)
    window.ipcRendererChannel?.WorkspaceTerminalExit?.removeListener?.(onExit)

  resizeObserver?.disconnect()
  resizeObserver = null
  fitAddon?.dispose()
  fitAddon = null
  term?.dispose()
  term = null
})
</script>

<style scoped>
.xterm-console {
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  display: flex;
  flex-direction: column;
  min-height: 200px;
  max-height: 40%;
}

.xterm-console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ui-border);
}

.xterm-console-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--app-font-size-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ui-text);
}

.xterm-console-running {
  color: var(--ui-text-muted);
  font-weight: 500;
}

.xterm-console-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.xterm-console-btn {
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.xterm-console-btn:hover {
  color: var(--ui-text);
  background: var(--ui-bg-elevated);
}

.xterm-console-body {
  flex: 1;
  min-height: 0;
  padding: 8px;
}

.xterm-console-body :deep(.xterm),
.xterm-console-body :deep(.xterm-viewport),
.xterm-console-body :deep(.xterm-screen) {
  height: 100%;
}
</style>
