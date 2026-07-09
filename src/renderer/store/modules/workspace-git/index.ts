import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAgentStore } from '@store/agent'
import {
  LAYOUT_PREF_KEYS,
  readStoredEditorSessionMap,
  writeStoredEditorSessionMap,
  type WorkspaceEditorSession,
} from '@renderer/lib/layout-preferences'

export type GitStatusEntry = {
  code: string
  index: string
  worktree: string
  path: string
  origPath?: string
}

export type GitLogEntry = {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  refs: string
}

export type GitFileEntry = {
  path: string
  name: string
  isDir: boolean
  gitStatus?: string
}

export type WorkspaceConsoleEntry = {
  id: string
  command: string
  cwd: string
  output: string
  exitCode: number
  at: string
}

export type WorkspaceEditorTab = {
  path: string
  content: string
  original: string
  loading: boolean
  error: string | null
  binary: boolean
  fileUrl: string | null
}

/** Electron IPC cannot structured-clone Vue reactive proxies. */
function toIpcStringList(values: string[]): string[] {
  return values.map((value) => String(value))
}

function sortFileEntries(items: readonly GitFileEntry[]): GitFileEntry[] {
  const dirs = items
    .filter((e) => e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name))
  const files = items
    .filter((e) => !e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

export const useWorkspaceGitStore = defineStore('workspace-git', () => {
  const workspacePath = ref<string | null>(null)
  const conversationId = ref<string | null>(null)

  const branch = ref('')
  const upstream = ref<string | null>(null)
  const ahead = ref(0)
  const behind = ref(0)
  const statusEntries = ref<GitStatusEntry[]>([])
  const statusLoading = ref(false)
  const statusError = ref<string | null>(null)

  const diff = ref('')
  const diffStaged = ref(false)
  const diffFiles = ref<string[]>([])
  const diffLoading = ref(false)
  const diffError = ref<string | null>(null)

  const commits = ref<GitLogEntry[]>([])
  const logLoading = ref(false)
  const logError = ref<string | null>(null)

  const fileEntries = ref<GitFileEntry[]>([])
  const filesDirectory = ref('.')
  const filesLoading = ref(false)
  const filesError = ref<string | null>(null)
  /** Inline-expanded folders in the file browser (survives passive refresh). */
  const expandedFileTreeDirs = ref<Record<string, boolean>>({})
  const expandedFileTreeChildren = ref<Record<string, GitFileEntry[]>>({})
  const expandedFileTreeLoading = ref<Record<string, boolean>>({})
  const expandedFileTreeErrors = ref<Record<string, string | null>>({})
  /** @deprecated Prefer store-driven expanded tree refresh; kept for compatibility. */
  const filesRefreshSeq = ref(0)

  const editorTabs = ref<WorkspaceEditorTab[]>([])
  const activeEditorPath = ref<string | null>(null)
  const editorSaving = ref(false)
  const editorSessionByConversation = ref<Record<string, WorkspaceEditorSession>>(
    readStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
    ),
  )
  let restoringEditorSession = false

  const activeEditorTab = computed(() => {
    const path = activeEditorPath.value
    if (!path) return null
    return editorTabs.value.find((tab) => tab.path === path) ?? null
  })

  const editorPath = computed(() => activeEditorPath.value)

  const editorContent = computed({
    get: () => activeEditorTab.value?.content ?? '',
    set: (value: string) => {
      const tab = activeEditorTab.value
      if (tab) tab.content = value
    },
  })

  const editorOriginal = computed(() => activeEditorTab.value?.original ?? '')

  const editorDirty = computed(() => {
    const tab = activeEditorTab.value
    return tab != null && tab.content !== tab.original
  })

  const editorLoading = computed(() => activeEditorTab.value?.loading ?? false)
  const editorError = computed(() => activeEditorTab.value?.error ?? null)
  const editorBinary = computed(() => activeEditorTab.value?.binary ?? false)
  const editorFileUrl = computed(() => activeEditorTab.value?.fileUrl ?? null)

  const openEditorPaths = computed(
    () => new Set(editorTabs.value.map((tab) => tab.path)),
  )

  function isEditorTabDirty(path: string): boolean {
    const tab = editorTabs.value.find((entry) => entry.path === path)
    return tab != null && tab.content !== tab.original
  }
  const consoleCommand = ref('')
  const consoleRunning = ref(false)
  const consoleError = ref<string | null>(null)
  const consoleEntries = ref<WorkspaceConsoleEntry[]>([])
  const consoleRunId = ref<string | null>(null)

  const consoleOpen = ref(false)
  const opLoading = ref(false)
  const opError = ref<string | null>(null)
  const opSuccess = ref<string | null>(null)
  const lastPrUrl = ref<string | null>(null)

  const commitMessage = ref('')
  const prTitle = ref('')
  const prBody = ref('')

  const isClean = computed(() => statusEntries.value.length === 0)

  const stagedEntries = computed(() =>
    statusEntries.value.filter((e) => e.index !== ' ' && e.index !== '?'),
  )

  const unstagedEntries = computed(() =>
    statusEntries.value.filter((e) => e.worktree !== ' ' && e.code !== '??'),
  )

  const untrackedEntries = computed(() =>
    statusEntries.value.filter((e) => e.code === '??'),
  )

  const isMutationsDisabled = computed(() => {
    const cid = conversationId.value?.trim()
    if (!cid || !workspacePath.value) return true
    return useAgentStore().isConversationStreamActive(cid)
  })

  const canPush = computed(() => {
    if (!branch.value.trim()) return false
    if (upstream.value != null) return ahead.value > 0
    return true
  })

  function requireConversationId(): string | null {
    const id = conversationId.value?.trim()
    if (id) return id
    return useAgentStore().currentConversationId?.trim() || null
  }

  function normalizeFilesDirectory(relativePath: string): string {
    const normalized = relativePath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .trim()
    if (!normalized || normalized === '.') return '.'
    const parts = normalized.split('/').filter((p) => p && p !== '.')
    return parts.join('/') || '.'
  }

  function parentFilesDirectory(relativePath: string): string {
    const normalized = normalizeFilesDirectory(relativePath)
    if (normalized === '.') return '.'
    const parts = normalized.split('/')
    parts.pop()
    return parts.length ? parts.join('/') : '.'
  }

  function snapshotEditorSession(): WorkspaceEditorSession {
    return {
      openPaths: editorTabs.value.map((tab) => tab.path),
      activePath: activeEditorPath.value,
      filesDirectory: filesDirectory.value,
    }
  }

  function readEditorSessionForConversation(
    convId: string,
  ): WorkspaceEditorSession {
    const id = convId.trim()
    if (!id) return { openPaths: [], activePath: null }
    const currentId = conversationId.value?.trim()
    if (currentId === id && workspacePath.value) {
      return snapshotEditorSession()
    }
    return (
      editorSessionByConversation.value[id] ?? { openPaths: [], activePath: null }
    )
  }

  function copyEditorSessionToConversation(
    sourceConversationId: string,
    targetConversationId: string,
  ): void {
    const sourceId = sourceConversationId.trim()
    const targetId = targetConversationId.trim()
    if (!sourceId || !targetId || sourceId === targetId) return
    saveEditorSessionForConversation(
      targetId,
      readEditorSessionForConversation(sourceId),
    )
  }

  function saveEditorSessionForConversation(
    convId: string,
    session: WorkspaceEditorSession,
  ): void {
    const id = convId.trim()
    if (!id) return
    const next = { ...editorSessionByConversation.value, [id]: session }
    editorSessionByConversation.value = next
    writeStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
      next,
    )
  }

  function persistEditorSession(): void {
    if (restoringEditorSession) return
    const cid = conversationId.value?.trim()
    if (!cid || !workspacePath.value) return
    saveEditorSessionForConversation(cid, snapshotEditorSession())
  }

  function clearInMemoryEditorTabs(): void {
    editorTabs.value = []
    activeEditorPath.value = null
    editorSaving.value = false
  }

  async function restoreEditorSession(convId: string): Promise<void> {
    if (!workspacePath.value) return
    const session = editorSessionByConversation.value[convId.trim()]
    if (!session?.openPaths.length) {
      if (session?.filesDirectory) {
        filesDirectory.value = normalizeFilesDirectory(session.filesDirectory)
        await refreshFiles()
      }
      return
    }

    restoringEditorSession = true
    try {
      clearInMemoryEditorTabs()
      if (session.filesDirectory) {
        filesDirectory.value = normalizeFilesDirectory(session.filesDirectory)
      }
      for (const path of session.openPaths) {
        await openFileInEditor(path)
      }
      if (
        session.activePath &&
        editorTabs.value.some((tab) => tab.path === session.activePath)
      ) {
        activeEditorPath.value = session.activePath
      }
      await refreshFiles()
    } finally {
      restoringEditorSession = false
      persistEditorSession()
    }
  }

  function closeAllEditorTabs() {
    clearInMemoryEditorTabs()
    persistEditorSession()
  }

  function setWorkspace(path: string | null, convId: string | null) {
    const prevConvId = conversationId.value?.trim()
    const prevPath = workspacePath.value
    const nextConvId =
      convId?.trim() || useAgentStore().currentConversationId?.trim() || null
    const pathChanged = prevPath !== path

    if (prevConvId && prevPath && (prevConvId !== nextConvId || !path)) {
      saveEditorSessionForConversation(prevConvId, snapshotEditorSession())
    }

    workspacePath.value = path
    conversationId.value = nextConvId
    filesDirectory.value = '.'
    resetExpandedFileTree()
    if (!path) {
      branch.value = ''
      upstream.value = null
      ahead.value = 0
      behind.value = 0
      statusEntries.value = []
      commits.value = []
      fileEntries.value = []
      diff.value = ''
      lastPrUrl.value = null
      clearInMemoryEditorTabs()
      consoleEntries.value = []
      consoleError.value = null
      consoleCommand.value = ''
      consoleRunning.value = false
      consoleRunId.value = null
      return
    }

    if (!pathChanged && prevConvId === nextConvId) return

    if (pathChanged && prevPath && prevConvId === nextConvId && nextConvId) {
      saveEditorSessionForConversation(nextConvId, {
        openPaths: [],
        activePath: null,
      })
      clearInMemoryEditorTabs()
      return
    }

    clearInMemoryEditorTabs()
    if (nextConvId) void restoreEditorSession(nextConvId)
  }

  function toggleConsole(open?: boolean) {
    consoleOpen.value = typeof open === 'boolean' ? open : !consoleOpen.value
  }

  function clearConsole() {
    consoleEntries.value = []
    consoleError.value = null
  }

  async function runConsoleCommand(commandText?: string): Promise<boolean> {
    if (isMutationsDisabled.value) return false
    const cid = requireConversationId()
    if (!cid) return false

    const command = (commandText ?? consoleCommand.value).trim()
    if (!command) {
      consoleError.value = 'Command must not be empty.'
      return false
    }

    const ch = window.ipcRendererChannel?.RunWorkspaceTerminalCommand
    if (!ch?.invoke) return false

    consoleRunning.value = true
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    consoleRunId.value = runId
    consoleError.value = null
    try {
      const result = await ch.invoke({
        conversationId: cid,
        command,
        relativeCwd: filesDirectory.value,
      })
      if (consoleRunId.value !== runId) return false

      const outputParts = [result.stdout ?? '', result.stderr ?? ''].filter(
        (part) => part.trim().length > 0,
      )
      const output = outputParts.join('\n')
      const entry: WorkspaceConsoleEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        command,
        cwd: result.cwd ?? workspacePath.value ?? '.',
        output: output || '(no output)',
        exitCode: result.exitCode ?? (result.ok ? 0 : 1),
        at: new Date().toISOString(),
      }
      consoleEntries.value = [...consoleEntries.value, entry].slice(-120)

      if (result.ok) {
        consoleCommand.value = ''
        await refreshWorkspaceView()
        return true
      }
      consoleError.value = result.error ?? 'Command failed.'
      return false
    } catch (err) {
      if (consoleRunId.value !== runId) return false
      consoleError.value = String(err)
      return false
    } finally {
      if (consoleRunId.value === runId) {
        consoleRunning.value = false
        consoleRunId.value = null
      }
    }
  }

  async function cancelConsoleCommand(): Promise<boolean> {
    const cid = requireConversationId()
    if (!cid || !consoleRunning.value) return false
    const ch = window.ipcRendererChannel?.CancelWorkspaceTerminalCommand
    if (!ch?.invoke) return false

    try {
      const result = await ch.invoke({ conversationId: cid })
      if (!result.ok) {
        consoleError.value = result.error ?? 'Failed to interrupt command.'
        return false
      }
      return true
    } catch (err) {
      consoleError.value = String(err)
      return false
    }
  }

  async function listFiles(
    relativePath: string,
  ): Promise<GitFileEntry[] | null> {
    const cid = requireConversationId()
    if (!cid) return null
    const ch = window.ipcRendererChannel?.ListWorkspaceFiles
    if (!ch?.invoke) return null

    try {
      const result = await ch.invoke({
        conversationId: cid,
        relativePath: normalizeFilesDirectory(relativePath),
      })
      if (result.ok) return result.entries
      return null
    } catch {
      return null
    }
  }

  async function refreshStatus(options?: { silent?: boolean }): Promise<void> {
    const cid = requireConversationId()
    if (!cid) return
    const ch = window.ipcRendererChannel?.GetWorkspaceGitStatus
    if (!ch?.invoke) return

    const silent = options?.silent === true
    if (!silent) {
      statusLoading.value = true
      statusError.value = null
    }
    try {
      const result = await ch.invoke({ conversationId: cid })
      if (result.ok) {
        branch.value = result.branch
        upstream.value = result.upstream
        ahead.value = result.ahead
        behind.value = result.behind
        statusEntries.value = result.entries.map((entry) => ({ ...entry }))
      } else if (!silent) {
        statusError.value = result.error ?? 'git status failed.'
      }
    } catch (err) {
      if (!silent) statusError.value = String(err)
    } finally {
      if (!silent) statusLoading.value = false
    }
  }

  async function refreshDiff(
    staged = false,
    files: string[] = [],
  ): Promise<void> {
    const cid = requireConversationId()
    if (!cid) return
    const ch = window.ipcRendererChannel?.GetWorkspaceGitDiff
    if (!ch?.invoke) return

    const fileList = toIpcStringList(files)
    diffStaged.value = staged
    diffFiles.value = fileList
    diffLoading.value = true
    diffError.value = null
    try {
      const result = await ch.invoke({
        conversationId: cid,
        staged,
        files: fileList,
      })
      if (result.ok) {
        diff.value = result.diff
      } else {
        diffError.value = result.error ?? 'git diff failed.'
        diff.value = ''
      }
    } catch (err) {
      diffError.value = String(err)
    } finally {
      diffLoading.value = false
    }
  }

  async function refreshLog(): Promise<void> {
    const cid = requireConversationId()
    if (!cid) return
    const ch = window.ipcRendererChannel?.GetWorkspaceGitLog
    if (!ch?.invoke) return

    logLoading.value = true
    logError.value = null
    try {
      const result = await ch.invoke({ conversationId: cid, limit: 30 })
      if (result.ok) {
        commits.value = result.commits
      } else {
        logError.value = result.error ?? 'git log failed.'
      }
    } catch (err) {
      logError.value = String(err)
    } finally {
      logLoading.value = false
    }
  }

  async function refreshFiles(
    relativePath?: string,
    options?: { silent?: boolean },
  ): Promise<void> {
    const cid = requireConversationId()
    if (!cid) return
    const ch = window.ipcRendererChannel?.ListWorkspaceFiles
    if (!ch?.invoke) return

    if (relativePath !== undefined) {
      filesDirectory.value = normalizeFilesDirectory(relativePath)
    }

    const silent = options?.silent === true
    if (!silent) {
      filesLoading.value = true
      filesError.value = null
    }
    try {
      const result = await ch.invoke({
        conversationId: cid,
        relativePath: filesDirectory.value,
      })
      if (result.ok) {
        fileEntries.value = result.entries.map((entry) => ({ ...entry }))
      } else if (!silent) {
        filesError.value = result.error ?? 'Failed to list files.'
      }
    } catch (err) {
      if (!silent) filesError.value = String(err)
    } finally {
      if (!silent) filesLoading.value = false
    }
  }

  function resetExpandedFileTree(): void {
    expandedFileTreeDirs.value = {}
    expandedFileTreeChildren.value = {}
    expandedFileTreeLoading.value = {}
    expandedFileTreeErrors.value = {}
  }

  function isFileTreeDirExpanded(relativePath: string): boolean {
    return expandedFileTreeDirs.value[normalizeFilesDirectory(relativePath)] === true
  }

  async function refreshExpandedFileTreeDirs(options?: {
    silent?: boolean
  }): Promise<void> {
    const dirs = Object.keys(expandedFileTreeDirs.value).filter(
      (dir) => expandedFileTreeDirs.value[dir],
    )
    if (!dirs.length) return

    const silent = options?.silent === true
    await Promise.all(
      dirs.map(async (dir) => {
        if (!silent) {
          expandedFileTreeLoading.value = {
            ...expandedFileTreeLoading.value,
            [dir]: true,
          }
          expandedFileTreeErrors.value = {
            ...expandedFileTreeErrors.value,
            [dir]: null,
          }
        }
        const nextEntries = await listFiles(dir)
        if (!silent) {
          expandedFileTreeLoading.value = {
            ...expandedFileTreeLoading.value,
            [dir]: false,
          }
        }
        if (!nextEntries) {
          if (!silent) {
            expandedFileTreeErrors.value = {
              ...expandedFileTreeErrors.value,
              [dir]: 'Failed to load folder.',
            }
          }
          return
        }
        expandedFileTreeChildren.value = {
          ...expandedFileTreeChildren.value,
          [dir]: sortFileEntries(nextEntries),
        }
      }),
    )
  }

  async function toggleFileTreeDirectory(relativePath: string): Promise<void> {
    const normalized = normalizeFilesDirectory(relativePath)
    if (isFileTreeDirExpanded(normalized)) {
      const next = { ...expandedFileTreeDirs.value }
      delete next[normalized]
      expandedFileTreeDirs.value = next
      return
    }

    expandedFileTreeDirs.value = {
      ...expandedFileTreeDirs.value,
      [normalized]: true,
    }
    if (expandedFileTreeChildren.value[normalized]) return

    expandedFileTreeLoading.value = {
      ...expandedFileTreeLoading.value,
      [normalized]: true,
    }
    expandedFileTreeErrors.value = {
      ...expandedFileTreeErrors.value,
      [normalized]: null,
    }

    const nextEntries = await listFiles(normalized)
    expandedFileTreeLoading.value = {
      ...expandedFileTreeLoading.value,
      [normalized]: false,
    }

    if (!nextEntries) {
      expandedFileTreeErrors.value = {
        ...expandedFileTreeErrors.value,
        [normalized]: 'Failed to load folder.',
      }
      return
    }

    expandedFileTreeChildren.value = {
      ...expandedFileTreeChildren.value,
      [normalized]: sortFileEntries(nextEntries),
    }
  }

  watch(filesDirectory, () => {
    resetExpandedFileTree()
  })

  async function navigateFilesToDirectory(relativePath: string): Promise<void> {
    await refreshFiles(relativePath)
  }

  async function navigateFilesUp(): Promise<void> {
    await refreshFiles(parentFilesDirectory(filesDirectory.value))
  }

  async function navigateFilesToHighlight(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/').trim()
    if (!normalized) return
    const slash = normalized.lastIndexOf('/')
    const parent = slash >= 0 ? normalized.slice(0, slash) : '.'
    await refreshFiles(parent)
  }

  async function stageAll(): Promise<boolean> {
    if (isMutationsDisabled.value) return false
    const cid = requireConversationId()
    if (!cid) return false
    const ch = window.ipcRendererChannel?.RunWorkspaceGitAdd
    if (!ch?.invoke) return false

    opLoading.value = true
    opError.value = null
    opSuccess.value = null
    try {
      const result = await ch.invoke({ conversationId: cid, files: [] })
      if (result.ok) {
        opSuccess.value = 'All changes staged.'
        await refreshStatus()
        return true
      }
      opError.value = result.error ?? 'git add failed.'
      return false
    } catch (err) {
      opError.value = String(err)
      return false
    } finally {
      opLoading.value = false
    }
  }

  async function stageFiles(files: string[]): Promise<boolean> {
    if (isMutationsDisabled.value) return false
    const cid = requireConversationId()
    if (!cid || !files.length) return false
    const ch = window.ipcRendererChannel?.RunWorkspaceGitAdd
    if (!ch?.invoke) return false

    opLoading.value = true
    opError.value = null
    opSuccess.value = null
    try {
      const fileList = toIpcStringList(files)
      const result = await ch.invoke({ conversationId: cid, files: fileList })
      if (result.ok) {
        opSuccess.value = `Staged ${fileList.length} file(s).`
        await refreshStatus()
        return true
      }
      opError.value = result.error ?? 'git add failed.'
      return false
    } catch (err) {
      opError.value = String(err)
      return false
    } finally {
      opLoading.value = false
    }
  }

  async function commit(): Promise<boolean> {
    if (isMutationsDisabled.value) return false
    const cid = requireConversationId()
    const msg = commitMessage.value.trim()
    if (!cid || !msg) return false
    const ch = window.ipcRendererChannel?.RunWorkspaceGitCommit
    if (!ch?.invoke) return false

    opLoading.value = true
    opError.value = null
    opSuccess.value = null
    try {
      const result = await ch.invoke({ conversationId: cid, message: msg })
      if (result.ok) {
        commitMessage.value = ''
        opSuccess.value = result.hash
          ? `Committed ${result.hash.slice(0, 7)}.`
          : 'Committed.'
        await Promise.all([refreshStatus(), refreshLog()])
        return true
      }
      opError.value = result.error ?? 'git commit failed.'
      return false
    } catch (err) {
      opError.value = String(err)
      return false
    } finally {
      opLoading.value = false
    }
  }

  async function push(
    options: { remote?: string; branch?: string; setUpstream?: boolean } = {},
  ): Promise<boolean> {
    if (isMutationsDisabled.value) return false
    const cid = requireConversationId()
    if (!cid) return false
    const ch = window.ipcRendererChannel?.RunWorkspaceGitPush
    if (!ch?.invoke) return false

    opLoading.value = true
    opError.value = null
    opSuccess.value = null
    try {
      const result = await ch.invoke({ conversationId: cid, ...options })
      if (result.ok) {
        opSuccess.value = 'Pushed successfully.'
        await refreshStatus()
        return true
      }
      opError.value = result.error ?? 'git push failed.'
      return false
    } catch (err) {
      opError.value = String(err)
      return false
    } finally {
      opLoading.value = false
    }
  }

  async function createPR(options: {
    title: string
    body: string
    base?: string
    draft?: boolean
  }): Promise<{ ok: boolean; url?: string }> {
    if (isMutationsDisabled.value) return { ok: false }
    const cid = requireConversationId()
    if (!cid) return { ok: false }
    const ch = window.ipcRendererChannel?.RunWorkspaceGitCreatePR
    if (!ch?.invoke) return { ok: false }

    opLoading.value = true
    opError.value = null
    opSuccess.value = null
    lastPrUrl.value = null
    try {
      const result = await ch.invoke({ conversationId: cid, ...options })
      if (result.ok) {
        lastPrUrl.value = result.url ?? null
        opSuccess.value = result.url
          ? `PR created: ${result.url}`
          : 'PR created!'
        return { ok: true, url: result.url }
      }
      opError.value = result.error ?? 'gh pr create failed.'
      return { ok: false }
    } catch (err) {
      opError.value = String(err)
      return { ok: false }
    } finally {
      opLoading.value = false
    }
  }

  async function openFile(relativePath: string): Promise<void> {
    const cid = requireConversationId()
    if (!cid) return
    const ch = window.ipcRendererChannel?.OpenWorkspaceFile
    if (!ch?.invoke) return
    await ch.invoke({ conversationId: cid, relativePath })
  }

  function activateEditorTab(relativePath: string): void {
    const normalized = relativePath.replace(/\\/g, '/').trim()
    if (!normalized) return
    if (!editorTabs.value.some((tab) => tab.path === normalized)) return
    activeEditorPath.value = normalized
    persistEditorSession()
  }

  function closeEditorTab(relativePath?: string): void {
    const normalized = (relativePath ?? activeEditorPath.value)
      ?.replace(/\\/g, '/')
      .trim()
    if (!normalized) return

    const index = editorTabs.value.findIndex((tab) => tab.path === normalized)
    if (index < 0) return

    const wasActive = activeEditorPath.value === normalized
    editorTabs.value = editorTabs.value.filter((tab) => tab.path !== normalized)

    if (!wasActive) {
      persistEditorSession()
      return
    }

    if (editorTabs.value.length === 0) {
      activeEditorPath.value = null
      persistEditorSession()
      return
    }

    const nextIndex = Math.min(index, editorTabs.value.length - 1)
    activeEditorPath.value = editorTabs.value[nextIndex]?.path ?? null
    persistEditorSession()
  }

  function closeEditorFile() {
    closeEditorTab(activeEditorPath.value ?? undefined)
  }

  async function loadEditorTabContent(normalized: string): Promise<void> {
    const tab = editorTabs.value.find((entry) => entry.path === normalized)
    if (!tab) return

    const cid = requireConversationId()
    tab.loading = true
    tab.error = null
    tab.binary = false
    tab.fileUrl = null

    if (!cid) {
      tab.loading = false
      tab.error = 'No conversation selected.'
      return
    }

    const ch = window.ipcRendererChannel?.ReadWorkspaceFile
    if (!ch?.invoke) {
      tab.loading = false
      tab.error = 'File read is unavailable.'
      return
    }

    try {
      const result = await ch.invoke({
        conversationId: cid,
        relativePath: normalized,
      })
      if (result.ok) {
        tab.content = result.content
        tab.original = result.content
        tab.fileUrl = result.fileUrl ?? null
      } else if (result.binary) {
        tab.binary = true
        tab.error = null
        tab.fileUrl = result.fileUrl ?? null
        tab.content = ''
        tab.original = ''
      } else {
        tab.error = result.error ?? 'Failed to read file.'
        tab.binary = false
        tab.fileUrl = result.fileUrl ?? null
        tab.content = ''
        tab.original = ''
      }
    } catch (err) {
      tab.error = String(err)
      tab.fileUrl = null
      tab.content = ''
      tab.original = ''
    } finally {
      tab.loading = false
    }
  }

  async function openFileInEditor(relativePath: string): Promise<void> {
    const cid = requireConversationId()
    if (!cid) return

    const normalized = relativePath.replace(/\\/g, '/').trim()
    if (!normalized) return

    const existing = editorTabs.value.find((tab) => tab.path === normalized)
    if (existing) {
      activeEditorPath.value = normalized
      persistEditorSession()
      return
    }

    const tab: WorkspaceEditorTab = {
      path: normalized,
      content: '',
      original: '',
      loading: true,
      error: null,
      binary: false,
      fileUrl: null,
    }
    editorTabs.value = [...editorTabs.value, tab]
    activeEditorPath.value = normalized
    await loadEditorTabContent(normalized)
    persistEditorSession()
  }

  async function reloadEditorFile(): Promise<void> {
    if (!activeEditorPath.value) return
    await loadEditorTabContent(activeEditorPath.value)
  }

  /** Reload open editor tabs from disk when they have no unsaved edits. */
  async function reloadEditorTabsFromDisk(): Promise<void> {
    const paths = [
      ...new Set(
        editorTabs.value
          .filter((tab) => !tab.loading && tab.content === tab.original)
          .map((tab) => tab.path),
      ),
    ]
    await Promise.all(paths.map((path) => loadEditorTabContent(path)))
  }

  /**
   * Passive refresh for file browser + git status when the workspace changes.
   *
   * Open editor tabs and the active git diff are intentionally left untouched:
   * reloading them on every filesystem notification caused flicker (Monaco remount,
   * diff panel flash). Re-open a file or click a git status row to refresh its
   * diff; use per-tab "Reload from disk" for editors.
   */
  async function refreshWorkspaceView(options?: {
    includeLog?: boolean
    silent?: boolean
  }): Promise<void> {
    const silent = options?.silent === true
    if (workspacePath.value) {
      await refreshAll({ silent })
      if (options?.includeLog) {
        await refreshLog()
      }
    } else {
      await refreshFiles(undefined, { silent })
    }
    await refreshExpandedFileTreeDirs({ silent })
    filesRefreshSeq.value += 1
  }

  async function saveEditorFile(): Promise<boolean> {
    if (isMutationsDisabled.value) return false
    const cid = requireConversationId()
    const path = activeEditorPath.value?.trim()
    const tab = activeEditorTab.value
    if (!cid || !path || !tab || tab.content === tab.original) return false

    const ch = window.ipcRendererChannel?.WriteWorkspaceFile
    if (!ch?.invoke) return false

    editorSaving.value = true
    tab.error = null
    try {
      const result = await ch.invoke({
        conversationId: cid,
        relativePath: path,
        content: tab.content,
      })
      if (result.ok) {
        tab.original = tab.content
        await Promise.all([refreshStatus(), refreshFiles()])
        return true
      }
      tab.error = result.error ?? 'Failed to save file.'
      return false
    } catch (err) {
      tab.error = String(err)
      return false
    } finally {
      editorSaving.value = false
    }
  }

  async function refreshAll(options?: { silent?: boolean }): Promise<void> {
    const silent = options?.silent === true
    await Promise.all([
      refreshStatus({ silent }),
      refreshFiles(undefined, { silent }),
    ])
  }

  return {
    workspacePath,
    conversationId,
    branch,
    upstream,
    ahead,
    behind,
    statusEntries,
    statusLoading,
    statusError,
    diff,
    diffStaged,
    diffFiles,
    diffLoading,
    diffError,
    commits,
    logLoading,
    logError,
    fileEntries,
    filesDirectory,
    filesLoading,
    filesError,
    expandedFileTreeDirs,
    expandedFileTreeChildren,
    expandedFileTreeLoading,
    expandedFileTreeErrors,
    filesRefreshSeq,
    editorTabs,
    activeEditorPath,
    openEditorPaths,
    editorPath,
    editorContent,
    editorOriginal,
    editorDirty,
    editorLoading,
    editorSaving,
    editorError,
    editorBinary,
    editorFileUrl,
    consoleOpen,
    consoleCommand,
    consoleRunning,
    consoleError,
    consoleEntries,
    consoleRunId,
    opLoading,
    opError,
    opSuccess,
    lastPrUrl,
    commitMessage,
    prTitle,
    prBody,
    isClean,
    stagedEntries,
    unstagedEntries,
    untrackedEntries,
    isMutationsDisabled,
    canPush,
    setWorkspace,
    refreshStatus,
    refreshDiff,
    refreshLog,
    refreshFiles,
    listFiles,
    resetExpandedFileTree,
    isFileTreeDirExpanded,
    refreshExpandedFileTreeDirs,
    toggleFileTreeDirectory,
    navigateFilesToDirectory,
    navigateFilesUp,
    navigateFilesToHighlight,
    stageAll,
    stageFiles,
    commit,
    push,
    createPR,
    openFile,
    openFileInEditor,
    activateEditorTab,
    closeEditorTab,
    closeEditorFile,
    closeAllEditorTabs,
    copyEditorSessionToConversation,
    isEditorTabDirty,
    reloadEditorFile,
    reloadEditorTabsFromDisk,
    saveEditorFile,
    toggleConsole,
    clearConsole,
    runConsoleCommand,
    cancelConsoleCommand,
    refreshAll,
    refreshWorkspaceView,
  }
})
