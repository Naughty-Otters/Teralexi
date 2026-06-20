import { reactive, readonly } from 'vue'
import type { AppUpdateMessage, AppVersionInfo } from '@shared/app-update'

export type AppUpdateViewState = AppUpdateMessage & {
  loaded: boolean
}

const defaultState = (): AppUpdateViewState => ({
  loaded: false,
  phase: 'idle',
  currentVersion: '0.0.0',
})

const state = reactive<AppUpdateViewState>(defaultState())
let listenersBound = false

function applyMessage(message: AppUpdateMessage) {
  Object.assign(state, message, { loaded: true })
}

export async function loadAppVersion(): Promise<AppVersionInfo> {
  const channel = window.ipcRendererChannel?.GetAppVersion
  if (!channel?.invoke) {
    return { version: '0.0.0', isPackaged: false }
  }
  const info = await channel.invoke()
  state.currentVersion = info.version
  state.loaded = true
  return info
}

export function bindAppUpdateListeners(): () => void {
  if (listenersBound) {
    return () => {}
  }
  listenersBound = true

  const channel = window.ipcRendererChannel?.updateMsg
  if (!channel?.on) {
    return () => {}
  }

  channel.on((_event, message) => {
    applyMessage(message)
  })

  return () => {
    listenersBound = false
  }
}

export async function checkForAppUpdate(): Promise<void> {
  state.phase = 'checking'
  await window.ipcRendererChannel?.CheckUpdate?.invoke()
}

export async function downloadAppUpdate(): Promise<void> {
  state.phase = 'downloading'
  state.percent = 0
  await window.ipcRendererChannel?.DownloadUpdate?.invoke()
}

export async function installAppUpdate(): Promise<void> {
  await window.ipcRendererChannel?.ConfirmUpdate?.invoke()
}

export function useAppUpdate() {
  return {
    state: readonly(state),
    loadAppVersion,
    checkForAppUpdate,
    downloadAppUpdate,
    installAppUpdate,
    bindAppUpdateListeners,
  }
}
