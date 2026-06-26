import { dialog, BrowserWindow, app, shell } from 'electron'
import { join, relative } from 'path'
import { promises as fsPromises } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { getPreloadFile, getWinURL } from '../config/static-path'
import { updater } from '../services/hot-updater'
import DownloadFile from '../services/download-file'
import { getAppUpdateManager } from '../services/check-update'
import { resolveAppVersion } from '../config/app-version'
import { getSupportConfig } from '../services/support-config'
import { recordSupportEvent } from '../services/support-event-store'
import { submitSupportReport } from '../services/support-report'
import type {
  SupportClientErrorPayload,
  SupportReportOptions,
} from '@shared/support-bundle'
import config from '@config/index'
import { parseAppAppearance } from '@shared/ui/appearance-settings'
import { applyWindowGlassEffect } from './window-glass'
import {
  ensureSystemPropFile,
  getSystemPropValue,
  getSystemPropValues,
  isValidSystemPropKey,
  setSystemPropValue,
} from '@config/system-prop'
import { LLM_DEBUG_MODE_PROPERTY_KEY } from '@shared/agent/llm-debug'
import { invalidateLlmDebugCache } from '@main/agent/llm/llm-debug-writer'
import { toIpcSerializable } from '@shared/utils/ipc-serializable'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import { IIpcMainHandle } from '@ipcManager/index'
import { webContentSend } from './web-content-send'
import {
  getSkillsDir,
  loadSkills,
  loadSkillActions,
  loadToolSetTools,
  skillToAgent,
} from '../skills/skills'
import {
  listSkillAttachments,
  readSkillAttachment,
} from '../skills/skill-attachments'
import {
  compileSkill,
  computeSkillSourceFingerprint,
} from '../skills/skill-compiler'
import {
  compileAllSkills,
  listSkillCompilationStatuses,
} from '../skills/skill-compilation-status'
import { resolveSkillCompilationSource } from '../skills/skill-path'
import { saveSkillCompilation } from '../skills/skill-compilation-save'
import { createLogger } from '@main/logger'
import { shortFingerprint } from '../skills/skill-compiler-log'

const skillCompilationIpcLog = createLogger('skills.compilation.ipc')
import { generateStepOutputPreview } from '../agent/sandbox/step-output-preview'
import { exportMarkdownBodyToPdf } from '../agent/sandbox/markdown-to-pdf'
import { callSkillToolDirect } from '../agent/steps/step-helpers'
import { previewFileChange } from '../../../toolSet/file-system/file-change-preview'
import { normalizeToolResult } from '@shared/tool-result/normalize-tool-result'
import { resolveSkillFolder } from '../skills/skill-path'
import { warmAgentCache } from '../cache/cache-warmer'
import { appCache } from '../cache/app-cache'
import {
  compileWorkflow,
  confirmWorkflowVersion,
  saveWorkflowDefinitionFromJson,
} from '../workflows/workflow-compiler'
import { runWorkflowCompilerAgent } from '../workflows/workflow-compiler-agent'
import { runWorkflowTest } from '../workflows/workflow-test-runner'
import { runWorkflowManual } from '../workflows/workflow-executor'
import { resolveWorkflowDeploymentTarget } from '../workflows/deployment/agent-server'
import {
  deployWorkflowLocally,
  getLocalWorkflowDeploymentTarget,
} from '../workflows/deployment/local'
import { listWorkflowPanelSkills } from '../workflows/workflow-skills'
import {
  createWorkflow,
  getWorkflowSnapshot,
} from '../workflows/workflow-store'
import { clearPlanExecutionIfAllDone } from '../agent/coding/plan-mode-execution-bridge'
import {
  bootstrapPlanModeStorage,
  clearPlanModeTodoArtifacts,
  getPlanModeView,
  planModeStorageOptionsFromEnv,
  transitionPlanMode,
} from '../agent/coding/plan-mode-state'
import { getOrCreateSandboxForConversation } from '../agent/sandbox'
import { defaultPlanModeView } from '@shared/agent/plan-mode-phase'
import { previewPlanApproval } from '../agent/coding/preview-plan-approval'
import { getConversationStore } from './conversation-store'
import {
  startGoogleAccountSignIn,
  loadStoredAccount,
  clearStoredAccount,
  googleAccountInfoForUi,
} from './google-account-oauth'
import { notifyGoogleAccountChanged } from './google-account-notify'
import {
  startGoogleWorkspaceSignIn,
  loadStoredAccount as loadStoredGoogleWorkspaceAccount,
  clearStoredAccount as clearStoredGoogleWorkspaceAccount,
  googleWorkspaceAccountInfoForUi,
} from './google-workspace-oauth'
import { notifyGoogleWorkspaceAccountChanged } from './google-workspace-account-notify'
import { clearOpenFdeServerAuthCache } from './openfde-server-auth'
import {
  startGitHubSignIn,
  loadStoredAccount as loadStoredGitHubAccount,
  clearStoredAccount as clearStoredGitHubAccount,
  githubAccountInfoForUi,
} from './github-oauth'
import { getMcpServerManager } from './mcp-server-manager'
import { checkMcpRuntimeStatus } from './mcp-runtime-check'
import { getMcpRegistryService } from './mcp-registry-service'
import { getWhatsAppChannelManager } from '@main/channels/whatsapp/manager'
import { getTelegramChannelManager } from '@main/channels/telegram/manager'
import { getDiscordChannelManager } from '@main/channels/discord/manager'
import { getWeChatChannelManager } from '@main/channels/wechat/manager'
import { getSlackChannelManager } from '@main/channels/slack/manager'
import { getSchedulerManager } from './scheduler-manager'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import {
  runAgentForConversation,
  runSubAgentMentionDelegation,
  stopAgentForConversation,
} from '@main/engine'
import {
  releaseConversationSandbox,
  syncSandboxOutputView,
  removeSandboxDirectories,
  releaseSubAgentSandboxesForConversation,
} from '@main/agent/sandbox'
import { serializeNeedsApproval } from '@main/skills/tool-ipc-meta'
import { extractZodParams } from '@main/utils/zod-introspection'
import { isConversationRunInFlight } from '@main/engine'
import {
  gitStatus,
  type GitStatusResult,
  gitDiff,
  gitLog,
  gitAdd,
  gitCommit,
  gitPush,
  ghCreatePr,
  listWorkspaceFiles,
  searchWorkspaceFiles,
  readWorkspaceFileContent,
  writeWorkspaceFileContent,
} from '@main/agent/workspace/git-service'
import {
  buildPickChatAttachmentDialogFilters,
  ingestChatAttachments,
  listConversationAttachmentMetas,
  resolveChatAttachmentAbsolutePath,
  searchChatAttachments,
} from '@main/services/chat-attachments'
import {
  cancelWorkspaceTerminalCommand,
  runWorkspaceTerminalCommandWithControl,
} from '@main/agent/workspace/workspace-terminal'
import {
  resizeWorkspaceTerminalSession,
  startWorkspaceTerminalSession,
  stopWorkspaceTerminalSession,
  writeWorkspaceTerminalInput,
} from '@main/agent/workspace/workspace-terminal-pty'
import { addSessionApprovedTool } from '@main/agent/session-tool-approval'
import { compactStoredConversation } from '@main/agent/compaction/manual-conversation-compact'
import {
  listBackgroundTasks,
  cancelBackgroundTask,
} from '@main/agent/background/background-task-manager'
import { installSkillFromGithub } from '@main/skills/install-skill-from-github'
import {
  getClawHubSkillDetail,
  installClawHubSkill,
  listClawHubInstalledSkills,
  previewClawHubSkillFile,
  searchClawHubSkills,
  uninstallClawHubSkill,
  updateAllClawHubSkills,
  updateClawHubSkill,
} from '@main/skills/clawhub/clawhub-skill-lifecycle'
import {
  resolveWorkspaceCwd,
  resolveWorkspaceFileOpen,
  ensureFilesCwd,
  resolveFilesCwd,
  resolveFilesFileOpen,
} from '@main/agent/workspace/workspace-ipc-helpers'
import {
  clearWorkspacePath,
  getWorkspacePath,
  getWorkspaceStack,
  loadConversationWorkspace,
  setWorkspacePath,
} from '@main/agent/workspace/conversation-workspace'
import { getLspManager } from '@main/agent/lsp'
import { getEditorLspBridge } from '@main/agent/lsp/editor-lsp-bridge'
import { formatWorkspaceFile } from '@main/agent/editor/format-service'
import { lintWorkspaceFile } from '@main/agent/editor/eslint-service'

// ─────────────────────────────────────────────────────────────────────────────

export class IpcMainHandleClass implements IIpcMainHandle {
  constructor() {
    ensureSystemPropFile()
  }
  GetSystemConfig: (
    event: Electron.IpcMainInvokeEvent,
    args: { key: string; defaultValue?: string },
  ) => string | Promise<string> = async (_event, args) => {
    if (!args?.key) return ''
    if (!isValidSystemPropKey(args.key)) return args.defaultValue ?? ''
    return getSystemPropValue(args.key, args.defaultValue ?? '')
  }
  GetSystemConfigs: (
    event: Electron.IpcMainInvokeEvent,
    args: { keys?: string[] },
  ) => Record<string, string> | Promise<Record<string, string>> = async (
    _event,
    args,
  ) => {
    const keys = args?.keys?.filter((key) => isValidSystemPropKey(key))
    return getSystemPropValues(keys)
  }
  SetSystemConfig: (
    event: Electron.IpcMainInvokeEvent,
    args: { key: string; value: string | number | boolean },
  ) => boolean | Promise<boolean> = async (_event, args) => {
    if (!args?.key || !isValidSystemPropKey(args.key)) return false
    setSystemPropValue(args.key, args.value)
    // Credentials changed — bust the cache so the next agent run picks up the new key.
    appCache.invalidateCredentials()
    return true
  }
  StartDownload: (
    event: Electron.IpcMainInvokeEvent,
    args: string,
  ) => void | Promise<void> = (event, downloadUrl) => {
    const windwos = BrowserWindow.fromWebContents(event.sender)
    if (!windwos) return
    new DownloadFile(windwos, downloadUrl).start()
  }
  StartServer: (
    event: Electron.IpcMainInvokeEvent,
  ) => string | Promise<string> = async () => {
    dialog.showErrorBox('error', 'API is obsolete')
    return 'API is obsolete'
  }
  StopServer: (event: Electron.IpcMainInvokeEvent) => string | Promise<string> =
    async () => {
      dialog.showErrorBox('error', 'API is obsolete')
      return 'API is obsolete'
    }
  HotUpdate: (event: Electron.IpcMainInvokeEvent) => void | Promise<void> = (
    event,
  ) => {
    const windows = BrowserWindow.fromWebContents(event.sender)
    if (!windows) return
    updater(windows)
  }
  OpenWin: (
    event: Electron.IpcMainInvokeEvent,
    args: { url: string; IsPay?: boolean; PayUrl?: string; sendData?: unknown },
  ) => void | Promise<void> = (event, arg) => {
    const childWin = new BrowserWindow({
      titleBarStyle: config.IsUseSysTitle ? 'default' : 'hidden',
      height: 595,
      useContentSize: true,
      width: 1140,
      autoHideMenuBar: true,
      minWidth: 842,
      frame: config.IsUseSysTitle,
      show: false,
      webPreferences: {
        sandbox: false,
        webSecurity: false,
        // DevTools available in development mode
        devTools: process.env.NODE_ENV === 'development',
        // Enable rubber-band scrolling on macOS
        scrollBounce: process.platform === 'darwin',
        preload: getPreloadFile('main-preload'),
      },
    })
    // Auto-open devtools in development mode
    if (process.env.NODE_ENV === 'development') {
      childWin.webContents.openDevTools({ mode: 'undocked', activate: true })
    }
    childWin.loadURL(getWinURL() + `#${arg.url}`)
    childWin.once('ready-to-show', () => {
      // childWin.show()
      if (arg.IsPay) {
        // Auto-close popup window when payment is complete
        const testUrl = setInterval(() => {
          const Url = childWin.webContents.getURL()
          if (arg.PayUrl && Url.includes(arg.PayUrl)) {
            childWin.close()
          }
        }, 1200)
        childWin.on('close', () => {
          clearInterval(testUrl)
        })
      }
    })
    // Triggered when renderer process is shown
    childWin.once('show', () => {
      webContentSend.SendDataTest(childWin.webContents, arg.sendData)
    })
  }

  IsUseSysTitle: (
    event: Electron.IpcMainInvokeEvent,
  ) => boolean | Promise<boolean> = async () => {
    return config.IsUseSysTitle
  }
  SetAppWindowAppearance: (
    event: Electron.IpcMainInvokeEvent,
    args: { appearance: 'solid' | 'glass' },
  ) => void | Promise<void> = (event, args) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const appearance = parseAppAppearance(args?.appearance)
    applyWindowGlassEffect(win, appearance)
  }
  AppClose: (event: Electron.IpcMainInvokeEvent) => void | Promise<void> = (
    event,
  ) => {
    app.quit()
  }
  CheckUpdate: (event: Electron.IpcMainInvokeEvent) => void | Promise<void> = (
    event,
  ) => {
    const windows = BrowserWindow.fromWebContents(event.sender)
    if (!windows) return
    getAppUpdateManager().checkUpdate(windows)
  }
  DownloadUpdate: (event: Electron.IpcMainInvokeEvent) => void | Promise<void> =
    (event) => {
      const windows = BrowserWindow.fromWebContents(event.sender)
      if (!windows) return
      getAppUpdateManager().downloadUpdate(windows)
    }
  ConfirmUpdate: (event: Electron.IpcMainInvokeEvent) => void | Promise<void> =
    () => {
      getAppUpdateManager().quitAndInstall()
    }
  GetAppVersion: (event: Electron.IpcMainInvokeEvent) =>
    | { version: string; isPackaged: boolean }
    | Promise<{
        version: string
        isPackaged: boolean
      }> = async () => ({
    version: resolveAppVersion(),
    isPackaged: app.isPackaged,
  })
  GetSupportConfig: (
    event: Electron.IpcMainInvokeEvent,
  ) =>
    | import('@shared/support-bundle').SupportConfig
    | Promise<import('@shared/support-bundle').SupportConfig> = async () =>
    getSupportConfig()
  ReportClientError: (
    event: Electron.IpcMainInvokeEvent,
    args: SupportClientErrorPayload,
  ) => void | Promise<void> = (_event, args) => {
    if (!args?.message?.trim()) return
    recordSupportEvent('renderer', args)
  }
  SubmitSupportReport: (
    event: Electron.IpcMainInvokeEvent,
    args: SupportReportOptions,
  ) =>
    | import('@shared/support-bundle').SupportReportResult
    | Promise<import('@shared/support-bundle').SupportReportResult> = async (
    _event,
    args,
  ) => submitSupportReport(args)
  OpenMessagebox: (
    event: Electron.IpcMainInvokeEvent,
    args: Electron.MessageBoxOptions,
  ) =>
    | Electron.MessageBoxReturnValue
    | Promise<Electron.MessageBoxReturnValue> = async (event, arg) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      // Optionally, handle the case where window is null
      throw new Error('No window found for event sender')
    }
    const res = await dialog.showMessageBox(window, {
      type: arg.type || 'info',
      title: arg.title || '',
      buttons: arg.buttons || [],
      message: arg.message || '',
      noLink: arg.noLink || true,
    })
    return res
  }
  OpenErrorbox: (
    event: Electron.IpcMainInvokeEvent,
    arg: { title: string; message: string },
  ) => void | Promise<void> = (event, arg) => {
    dialog.showErrorBox(arg.title, arg.message)
  }
  WinReady: (event: Electron.IpcMainInvokeEvent) => void | Promise<void> = (
    event,
  ) => {
    const windows = BrowserWindow.fromWebContents(event.sender)
    if (!windows) return
    windows.show()
  }

  LoadSkills: (
    event: Electron.IpcMainInvokeEvent,
  ) =>
    | ReturnType<typeof skillToAgent>[]
    | Promise<ReturnType<typeof skillToAgent>[]> = async () => {
    const skills = await loadSkills()
    const agents: ReturnType<typeof skillToAgent>[] = []
    for (const skill of skills) {
      try {
        agents.push(skillToAgent(skill))
      } catch (err) {
        skillCompilationIpcLog.warn('LoadSkills: skillToAgent failed', {
          skillId: skill.id,
          err,
        })
      }
    }
    return agents
  }

  ListWorkflowPanelSkills: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<
    import('@main/workflows/workflow-skills').WorkflowPanelSkillInfo[]
  > = async () => listWorkflowPanelSkills()

  ListAgentConfigurations: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => ReturnType<
    ReturnType<typeof getConversationStore>['listAgentConfigurations']
  > = (_event, args) => {
    return getConversationStore().listAgentConfigurations(args.userId)
  }

  UpsertAgentConfiguration: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      agentId: string
      userId: string
      name: string
      description: string
      model: string
      provider: ProviderType
      color:
        | 'primary'
        | 'secondary'
        | 'success'
        | 'info'
        | 'warning'
        | 'error'
        | 'neutral'
      enabled: boolean
      systemPrompt: string
      skillsPrompt: string
      availableSet: string[]
      availableSetTouched: boolean
      toolNeedsApprovalOverrides: Record<string, boolean>
      availableMcpServers: string[] | null
      toolLoopMaxIterations: number
      todoMaxRetries: number
      allowAsSubAgent: boolean
      allowSubAgents: boolean
      subAgentIds: string[] | null
      llmRoutingMode: 'unified' | 'per_stage'
      stageLlm: Partial<
        Record<
          'explore' | 'toolLoop' | 'verifier',
          { provider: ProviderType; model: string }
        >
      >
    },
  ) => void = (_event, args) => {
    getConversationStore().upsertAgentConfiguration(args)
    appCache.invalidateAgents(args.userId)
  }

  DeleteAgentConfiguration: (
    _event: Electron.IpcMainInvokeEvent,
    args: { agentId: string; userId: string },
  ) => void = (_event, args) => {
    getConversationStore().deleteAgentConfiguration(args.agentId, args.userId)
  }

  ListToolSetTools: (_event: Electron.IpcMainInvokeEvent) => Promise<
    Array<{
      name: string
      tags: string[]
      description: string
      needsApproval?: boolean
      os?: 'mac' | 'linux' | 'win'
      params: Array<{
        name: string
        type: string
        required: boolean
        description?: string
        default?: string
      }>
    }>
  > = async () => {
    const tools = await loadToolSetTools()
    return tools.map((t) => {
      let params: ReturnType<typeof extractZodParams> = []
      try {
        params = extractZodParams(t.inputSchema)
      } catch {
        params = []
      }
      return {
        name: t.name,
        tags: t.tags && t.tags.length > 0 ? t.tags : ['toolSet'],
        description: t.description,
        needsApproval: serializeNeedsApproval(t.needsApproval),
        os: t.os as 'mac' | 'linux' | 'win' | undefined,
        params,
      }
    })
  }

  CallSkillTool: (
    event: Electron.IpcMainInvokeEvent,
    args: { skillId: string; toolName: string; input: unknown },
  ) => Promise<unknown> = async (_event, args) => {
    const { skillId, toolName, input } = args
    if (!skillId || !toolName) {
      throw new Error('Missing skillId or toolName')
    }

    return callSkillToolDirect(skillId, toolName, input)
  }

  GetSkillsDir: (
    event: Electron.IpcMainInvokeEvent,
  ) => string | Promise<string> = async () => {
    return getSkillsDir()
  }

  ListSkillAttachments: (
    _event: Electron.IpcMainInvokeEvent,
    args: { skillId: string },
  ) => ReturnType<typeof listSkillAttachments> = (_event, args) => {
    return listSkillAttachments(args.skillId ?? '').map(
      ({ absolutePath: _absolutePath, ...rest }) => rest,
    )
  }

  ReadSkillAttachment: (
    _event: Electron.IpcMainInvokeEvent,
    args: { skillId: string; relativePath: string },
  ) => ReturnType<typeof readSkillAttachment> = (_event, args) => {
    return readSkillAttachment(args.skillId ?? '', args.relativePath ?? '')
  }

  GetSkillCompilation: (
    _event: Electron.IpcMainInvokeEvent,
    args: { skillId: string },
  ) => {
    status: 'pending' | 'ready' | 'failed' | 'missing'
    source: 'bundled' | 'user' | null
    compiled:
      | import('../skills/skill-compiled-schema').SkillCompiledArtifact
      | null
    errorMessage: string | null
    fingerprint: string
    compiledAt: string | null
  } = (_event, args) => {
    const skillId = args.skillId?.trim() ?? ''
    const source = resolveSkillCompilationSource(skillId)
    const fingerprint = computeSkillSourceFingerprint(skillId)
    if (!source) {
      return {
        status: 'missing' as const,
        source: null,
        compiled: null,
        errorMessage: null,
        fingerprint,
        compiledAt: null,
      }
    }
    const row = getConversationStore().getSkillCompilation(skillId, source)
    if (!row) {
      return {
        status: 'missing' as const,
        source,
        compiled: null,
        errorMessage: null,
        fingerprint,
        compiledAt: null,
      }
    }
    return {
      status: row.status,
      source: row.source,
      compiled: row.compiled,
      errorMessage: row.errorMessage,
      fingerprint: row.sourceFingerprint || fingerprint,
      compiledAt: row.compiledAt,
    }
  }

  ListSkillCompilations: (
    _event: Electron.IpcMainInvokeEvent,
  ) => ReturnType<typeof listSkillCompilationStatuses> = () => {
    skillCompilationIpcLog.info('skill compilation IPC: ListSkillCompilations')
    const items = listSkillCompilationStatuses()
    return items
  }

  CompileAllSkills: (
    _event: Electron.IpcMainInvokeEvent,
    args: { force?: boolean },
  ) => ReturnType<typeof compileAllSkills> = async (_event, args) => {
    const force = !!args?.force
    skillCompilationIpcLog.info(
      { force },
      'skill compilation IPC: CompileAllSkills',
    )
    const results = await compileAllSkills({ force })
    skillCompilationIpcLog.info(
      {
        force,
        total: results.length,
        ready: results.filter((r) => r.status === 'ready').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
      'skill compilation IPC: CompileAllSkills done',
    )
    return results
  }

  CompileSkill: (
    _event: Electron.IpcMainInvokeEvent,
    args: { skillId: string; force?: boolean },
  ) => Promise<{
    status: 'pending' | 'ready' | 'failed' | 'missing'
    compiled:
      | import('../skills/skill-compiled-schema').SkillCompiledArtifact
      | null
    errorMessage: string | null
    fingerprint: string
    compiledAt: string | null
  }> = async (_event, args) => {
    const skillId = args.skillId?.trim() ?? ''
    const force = !!args.force
    skillCompilationIpcLog.info(
      { skillId, force },
      'skill compilation IPC: CompileSkill',
    )
    const source = resolveSkillCompilationSource(skillId)
    const fingerprint = computeSkillSourceFingerprint(skillId)
    if (!source) {
      skillCompilationIpcLog.warn(
        { skillId, fingerprint: shortFingerprint(fingerprint) },
        'skill compilation IPC: skill folder not found',
      )
      return {
        status: 'missing',
        compiled: null,
        errorMessage: 'Skill folder not found',
        fingerprint,
        compiledAt: null,
      }
    }
    const compiled = await compileSkill(skillId, { force })
    const row = getConversationStore().getSkillCompilation(skillId, source)
    const status = row?.status ?? (compiled ? 'ready' : 'failed')
    if (status === 'failed') {
      skillCompilationIpcLog.error(
        {
          skillId,
          force,
          errorMessage: row?.errorMessage,
          fingerprint: shortFingerprint(row?.sourceFingerprint ?? fingerprint),
        },
        'skill compilation IPC: CompileSkill failed',
      )
    } else {
      skillCompilationIpcLog.info(
        {
          skillId,
          force,
          status,
          fingerprint: shortFingerprint(row?.sourceFingerprint ?? fingerprint),
        },
        'skill compilation IPC: CompileSkill done',
      )
    }
    return {
      status,
      compiled: compiled ?? row?.compiled ?? null,
      errorMessage: row?.errorMessage ?? null,
      fingerprint: row?.sourceFingerprint ?? fingerprint,
      compiledAt: row?.compiledAt ?? null,
    }
  }

  RecompileSkill: (
    _event: Electron.IpcMainInvokeEvent,
    args: { skillId: string },
  ) => Promise<{
    status: 'pending' | 'ready' | 'failed' | 'missing'
    compiled:
      | import('../skills/skill-compiled-schema').SkillCompiledArtifact
      | null
    errorMessage: string | null
    fingerprint: string
    compiledAt: string | null
  }> = async (event, args) => {
    return this.CompileSkill(event, { ...args, force: true })
  }

  SaveSkillCompilation: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      skillId: string
      compiled: import('../skills/skill-compiled-schema').SkillCompiledArtifact
    },
  ) => {
    ok: boolean
    compiled:
      | import('../skills/skill-compiled-schema').SkillCompiledArtifact
      | null
    errorMessage: string | null
    fingerprint: string
    compiledAt: string | null
  } = (_event, args) => {
    const skillId = args.skillId?.trim() ?? ''
    skillCompilationIpcLog.info(
      { skillId },
      'skill compilation IPC: SaveSkillCompilation',
    )
    const result = saveSkillCompilation(skillId, args.compiled)
    if (!result.ok) {
      skillCompilationIpcLog.warn(
        { skillId, errorMessage: result.errorMessage },
        'skill compilation IPC: SaveSkillCompilation failed',
      )
      return {
        ok: false,
        compiled: null,
        errorMessage: result.errorMessage,
        fingerprint: computeSkillSourceFingerprint(skillId),
        compiledAt: null,
      }
    }
    skillCompilationIpcLog.info(
      { skillId, fingerprint: shortFingerprint(result.fingerprint) },
      'skill compilation IPC: SaveSkillCompilation done',
    )
    return {
      ok: true,
      compiled: result.compiled,
      errorMessage: null,
      fingerprint: result.fingerprint,
      compiledAt: result.compiledAt,
    }
  }

  GetStepOutputLinkPreview: (
    _event: Electron.IpcMainInvokeEvent,
    args: { fileUrl: string },
  ) => ReturnType<typeof generateStepOutputPreview> = async (_event, args) => {
    return generateStepOutputPreview(args.fileUrl ?? '')
  }

  PreviewFileChange: (
    _event: Electron.IpcMainInvokeEvent,
    args: { toolName: string; input: Record<string, unknown> },
  ) => ReturnType<typeof previewFileChange> = async (_event, args) => {
    const result = await previewFileChange(
      args.toolName ?? '',
      args.input ?? {},
    )
    if (!result.ok) return result
    return normalizeToolResult(args.toolName ?? '', result) as typeof result
  }

  PreviewPlanApproval: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; agentSummary?: string },
  ) => ReturnType<typeof previewPlanApproval> = (_event, args) => {
    return previewPlanApproval({
      conversationId: args?.conversationId ?? '',
      agentSummary: args?.agentSummary,
    })
  }

  ListConversations: (
    _event: Electron.IpcMainInvokeEvent,
    args: { agentId: string },
  ) => ReturnType<
    ReturnType<typeof getConversationStore>['listConversations']
  > = (_event, args) => {
    return getConversationStore().listConversations(args.agentId)
  }

  CreateConversation: (
    _event: Electron.IpcMainInvokeEvent,
    args: { id: string; agentId: string; title: string; createdAt: string },
  ) => ReturnType<
    ReturnType<typeof getConversationStore>['createConversation']
  > = (_event, args) => {
    const now = args.createdAt
    return getConversationStore().createConversation({
      id: args.id,
      agentId: args.agentId,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    })
  }

  UpdateConversationTitle: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; title: string },
  ) => void = (_event, args) => {
    getConversationStore().updateConversationTitle(
      args.conversationId,
      args.title,
    )
  }

  UpdateConversationAgent: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; agentId: string },
  ) => void = (_event, args) => {
    getConversationStore().updateConversationAgent(
      args.conversationId,
      args.agentId,
    )
  }

  GetConversationMeta: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => ReturnType<ReturnType<typeof getConversationStore>['getConversation']> =
    (_event, args) => {
      return getConversationStore().getConversation(args.conversationId)
    }

  DeleteConversation: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => Promise<void> = async (_event, args) => {
    await releaseConversationSandbox(args.conversationId)
    const subAgentRoots = await releaseSubAgentSandboxesForConversation(
      args.conversationId,
    )
    const store = getConversationStore()
    const roots = [
      ...store.listSandboxRootsForConversation(args.conversationId),
      ...subAgentRoots,
    ]
    if (roots.length > 0) {
      await removeSandboxDirectories(roots)
    }
    store.deleteConversation(args.conversationId)
  }

  ClearConversationHistory: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => void = (_event, args) => {
    getConversationStore().clearConversationHistory(args.conversationId)
  }

  GetConversationSandboxRuns: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => ReturnType<
    ReturnType<typeof getConversationStore>['listSandboxRunsForConversation']
  > = (_event, args) => {
    return getConversationStore().listSandboxRunsForConversation(
      args.conversationId,
    )
  }

  GetConversation: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => ReturnType<ReturnType<typeof getConversationStore>['getMessages']> = (
    _event,
    args,
  ) => {
    return getConversationStore().getMessages(args.conversationId)
  }

  GetConversationMessagesPage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; before?: string; limit?: number },
  ) => ReturnType<ReturnType<typeof getConversationStore>['getMessagesPage']> =
    (_event, args) => {
      return getConversationStore().getMessagesPage(args.conversationId, {
        before: args.before,
        limit: args.limit,
      })
    }

  SaveMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      id: string
      conversationId: string
      agentId: string
      role: 'user' | 'assistant'
      content: string
      createdAt: string
    },
  ) => void = (_event, args) => {
    getConversationStore().saveMessage(args)
  }

  ListTokenUsageChart: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      userId?: string
      since?: string
      until?: string
    },
  ) => ReturnType<
    ReturnType<typeof getConversationStore>['getTokenUsageDashboard']
  > = (_event, args) => {
    const payload = args ?? {}
    return getConversationStore().getTokenUsageDashboard({
      userId: payload.userId ?? 'default',
      since: payload.since,
      until: payload.until,
    })
  }

  UpdateMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { id: string; content: string },
  ) => void = (_event, args) => {
    getConversationStore().updateMessage(args.id, args.content)
  }

  GetUserProperties: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => Record<string, string> = (_event, args) => {
    return getConversationStore().getUserPropertiesMap(args.userId)
  }

  ListUserProperties: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => ReturnType<
    ReturnType<typeof getConversationStore>['listUserProperties']
  > = (_event, args) => {
    return getConversationStore().listUserProperties(args.userId)
  }

  GetUserProperty: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; propertyKey: string },
  ) => ReturnType<ReturnType<typeof getConversationStore>['getUserProperty']> =
    (_event, args) => {
      return getConversationStore().getUserProperty(
        args.userId,
        args.propertyKey,
      )
    }

  SetUserProperty: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; propertyKey: string; propertyValue: string },
  ) => void = (_event, args) => {
    getConversationStore().setUserProperty(
      args.userId,
      args.propertyKey,
      args.propertyValue,
    )
    if (args.propertyKey === LLM_DEBUG_MODE_PROPERTY_KEY) {
      invalidateLlmDebugCache(args.userId)
    }
  }

  DeleteUserProperty: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; propertyKey: string },
  ) => void = (_event, args) => {
    getConversationStore().deleteUserProperty(args.userId, args.propertyKey)
  }

  ClearUserProperties: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => void = (_event, args) => {
    getConversationStore().clearUserProperties(args.userId)
  }

  ListMcpServers: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => ReturnType<ReturnType<typeof getConversationStore>['listMcpServers']> = (
    _event,
    args,
  ) => {
    return getConversationStore().listMcpServers(args.userId)
  }

  CreateMcpServer: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      id: string
      userId: string
      name: string
      transportType: 'http' | 'sse' | 'stdio'
      url?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      headers?: Record<string, string>
      enabled?: boolean
    },
  ) => ReturnType<ReturnType<typeof getConversationStore>['createMcpServer']> =
    (_event, args) => {
      return getConversationStore().createMcpServer({
        id: args.id,
        userId: args.userId,
        name: args.name,
        transportType: args.transportType,
        url: args.url ?? '',
        command: args.command ?? '',
        args: args.args ?? [],
        env: args.env ?? {},
        headers: args.headers ?? {},
        enabled: args.enabled ?? true,
      })
    }

  SetMcpServerEnabled: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; serverId: string; enabled: boolean },
  ) => void = (_event, args) => {
    getConversationStore().setMcpServerEnabled(
      args.userId,
      args.serverId,
      args.enabled,
    )

    if (!args.enabled) {
      void getMcpServerManager().closeClient(args.serverId)
    }
  }

  DeleteMcpServer: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; serverId: string },
  ) => void = (_event, args) => {
    getConversationStore().deleteMcpServer(args.userId, args.serverId)
    void getMcpServerManager().closeClient(args.serverId)
  }

  GetMcpServerTools: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; serverId: string },
  ) => Promise<
    Array<{ name: string; description: string; inputSchema?: unknown }>
  > = async (_event, args) => {
    const server = getConversationStore().getMcpServer(
      args.userId,
      args.serverId,
    )
    if (!server) {
      throw new Error(`MCP server not found: ${args.serverId}`)
    }
    if (!server.enabled) {
      return []
    }
    return getMcpServerManager().listTools(server)
  }

  GetMcpRuntimeStatus: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<ReturnType<typeof checkMcpRuntimeStatus>> = async () => {
    return checkMcpRuntimeStatus()
  }

  CallMcpServerTool: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      userId: string
      serverId: string
      toolName: string
      input: unknown
    },
  ) => Promise<unknown> = async (_event, args) => {
    const server = getConversationStore().getMcpServer(
      args.userId,
      args.serverId,
    )
    if (!server) {
      throw new Error(`MCP server not found: ${args.serverId}`)
    }
    if (!server.enabled) {
      throw new Error(`MCP server is disabled: ${args.serverId}`)
    }
    return getMcpServerManager().callTool(server, args.toolName, args.input)
  }

  SearchMcpRegistry: (
    _event: Electron.IpcMainInvokeEvent,
    args: { search?: string; cursor?: string; limit?: number },
  ) => ReturnType<ReturnType<typeof getMcpRegistryService>['searchServers']> =
    async (_event, args) => {
      return getMcpRegistryService().searchServers(args)
    }

  GetMcpRegistryServer: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      serverName: string
      version?: string
      preferredTransport?: 'http' | 'sse' | 'stdio'
    },
  ) => ReturnType<ReturnType<typeof getMcpRegistryService>['getServerDrafts']> =
    async (_event, args) => {
      return getMcpRegistryService().getServerDrafts(args)
    }

  SaveDataToFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; relativePath: string; data: unknown },
  ) => { filePath: string } = (_event, args) => {
    const filePath = getConversationStore().saveDataToFile(
      args.userId,
      args.relativePath,
      args.data,
    )
    return { filePath }
  }

  ListSchedulers: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => ReturnType<ReturnType<typeof getConversationStore>['listSchedulers']> = (
    _event,
    args,
  ) => {
    return getConversationStore().listSchedulers(args.userId)
  }

  UpsertScheduler: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      id: string
      userId: string
      name: string
      enabled: boolean
      scheduleType: 'interval' | 'cron'
      intervalMs: number | null
      cronExpression: string | null
      timezone: string | null
      actionType: 'send-channel-message' | 'run-agent' | 'run-workflow'
      channelId: string
      target: string
      message: string
      agentId: string
      conversationId: string
      prompt: string
      workflowId: string
    },
  ) => void = (_event, args) => {
    getConversationStore().upsertScheduler(args)
    getSchedulerManager().upsertSchedule(args.id, args.userId)
  }

  DeleteScheduler: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; schedulerId: string },
  ) => void = (_event, args) => {
    getConversationStore().deleteScheduler(args.userId, args.schedulerId)
    getSchedulerManager().removeSchedule(args.schedulerId)
  }

  ListWorkflows: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string },
  ) => ReturnType<ReturnType<typeof getConversationStore>['listWorkflows']> = (
    _event,
    args,
  ) => getConversationStore().listWorkflows(args.userId)

  GetWorkflowSnapshot: (
    _event: Electron.IpcMainInvokeEvent,
    args: { workflowId: string },
  ) => import('@main/workflows/workflow-store').WorkflowStoreSnapshot | null = (
    _event,
    args,
  ) => getWorkflowSnapshot(args.workflowId)

  CompileWorkflow: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      userId: string
      workflowId?: string
      prompt?: string
      uploadMarkdown?: string
      uploadPath?: string
      baseVersionId?: string
    },
  ) => Promise<
    import('@main/workflows/workflow-compiler').WorkflowCompileResponse
  > = async (_event, args) => compileWorkflow(args)

  RunWorkflowCompilerAgent: (
    event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      workflowId: string
      assistantMessageId: string
      userId: string
      uiMessages?: unknown[]
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
      baseVersionId?: string
      compileHints?: import('@shared/workflows/workflow-studio').WorkflowCompileHints
    },
  ) => Promise<
    import('@shared/workflows/workflow-studio').RunWorkflowCompilerAgentIpcResult
  > = async (event, args) => {
    const result = await runWorkflowCompilerAgent({
      ...args,
      webContents: event.sender,
    })
    return toIpcSerializable({
      finalContent: result.finalContent,
      hasError: result.hasError,
      errorMessage: result.errorMessage,
    })
  }

  ConfirmWorkflowVersion: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; workflowId: string; versionId: string },
  ) => { ok: true; definitionJson: string } = (_event, args) => {
    const definition = confirmWorkflowVersion(args)
    return { ok: true, definitionJson: JSON.stringify(definition) }
  }

  SaveWorkflowDefinitionJson: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      userId: string
      workflowId: string
      definitionJson: string
      baseVersionId?: string
    },
  ) => Promise<
    import('@main/workflows/workflow-compiler').SaveWorkflowDefinitionResponse
  > = async (_event, args) => saveWorkflowDefinitionFromJson(args)

  RunWorkflowTest: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      workflowId: string
      versionId: string
      inputs?: Record<string, unknown>
    },
  ) => Promise<
    import('@shared/workflows/deployment-target').WorkflowTestReport
  > = async (_event, args) => {
    const store = getConversationStore()
    const version = store.getWorkflowVersion(args.versionId)
    if (!version) throw new Error('Workflow version not found')
    const result = await runWorkflowTest({
      workflowId: args.workflowId,
      version,
      inputs: args.inputs,
    })
    store.upsertWorkflow({
      ...store.getWorkflow(args.workflowId)!,
      status: 'testing',
    })
    return result.report
  }

  DeployWorkflow: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      workflowId: string
      versionId: string
      target?: 'local' | 'agent-server'
      enabled?: boolean
      workspacePath?: string | null
    },
  ) => Promise<import('@shared/workflows/deployment-target').DeployHandle> =
    async (_event, args) => {
      const target = args.target ?? 'local'
      if (target === 'agent-server') {
        const store = getConversationStore()
        const version = store.getWorkflowVersion(args.versionId)
        if (!version) throw new Error('Workflow version not found')
        const definition = JSON.parse(version.definitionJson)
        return resolveWorkflowDeploymentTarget('agent-server').deploy(
          args.versionId,
          definition,
          { enabled: args.enabled ?? true, workspacePath: args.workspacePath },
        )
      }
      return deployWorkflowLocally({
        workflowId: args.workflowId,
        versionId: args.versionId,
        config: {
          enabled: args.enabled ?? true,
          workspacePath: args.workspacePath,
        },
      })
    }

  UndeployWorkflow: (
    _event: Electron.IpcMainInvokeEvent,
    args: { deploymentId: string },
  ) => Promise<{ ok: true }> = async (_event, args) => {
    await getLocalWorkflowDeploymentTarget().undeploy(args.deploymentId)
    return { ok: true }
  }

  RunWorkflowManual: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      workflowId: string
      versionId?: string
      inputs?: Record<string, unknown>
    },
  ) => Promise<
    import('@main/workflows/workflow-executor').WorkflowExecuteResult
  > = async (_event, args) => runWorkflowManual(args)

  DeleteWorkflow: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; workflowId: string },
  ) => { ok: true } = (_event, args) => {
    getConversationStore().deleteWorkflow(args.userId, args.workflowId)
    return { ok: true }
  }

  CreateWorkflowDraft: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; name: string; description?: string },
  ) => { workflowId: string } = (_event, args) => createWorkflow(args)

  GoogleSignIn: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    email: string
    name: string
    picture: string
  }> = async () => {
    clearOpenFdeServerAuthCache()
    const account = await startGoogleAccountSignIn()
    clearOpenFdeServerAuthCache()
    return googleAccountInfoForUi(account)
  }

  GoogleSignOut: (_event: Electron.IpcMainInvokeEvent) => void = () => {
    clearStoredAccount()
    clearOpenFdeServerAuthCache()
    notifyGoogleAccountChanged(null)
  }

  GetGoogleAccount: (_event: Electron.IpcMainInvokeEvent) => {
    email: string
    name: string
    picture: string
  } | null = () => {
    const account = loadStoredAccount()
    if (!account) return null
    return googleAccountInfoForUi(account)
  }

  GoogleWorkspaceSignIn: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    email: string
    name: string
    picture: string
    workspaceAccess: boolean
  }> = async () => {
    const account = await startGoogleWorkspaceSignIn()
    return googleWorkspaceAccountInfoForUi(account)
  }

  GoogleWorkspaceSignOut: (_event: Electron.IpcMainInvokeEvent) => void = () => {
    clearStoredGoogleWorkspaceAccount()
    notifyGoogleWorkspaceAccountChanged(null)
  }

  GetGoogleWorkspaceAccount: (_event: Electron.IpcMainInvokeEvent) => {
    email: string
    name: string
    picture: string
    workspaceAccess: boolean
  } | null = () => {
    const account = loadStoredGoogleWorkspaceAccount()
    if (!account) return null
    return googleWorkspaceAccountInfoForUi(account)
  }

  GitHubSignIn: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    login: string
    name: string
    email: string
    avatarUrl: string
    skillAccess: boolean
    missingScopes: string[]
  }> = async () => {
    const account = await startGitHubSignIn()
    return githubAccountInfoForUi(account)
  }

  GitHubSignOut: (_event: Electron.IpcMainInvokeEvent) => void = () => {
    clearStoredGitHubAccount()
  }

  GetGitHubAccount: (_event: Electron.IpcMainInvokeEvent) => {
    login: string
    name: string
    email: string
    avatarUrl: string
    skillAccess: boolean
    missingScopes: string[]
  } | null = () => {
    const account = loadStoredGitHubAccount()
    if (!account) return null
    return githubAccountInfoForUi(account)
  }

  GetWhatsAppState: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    targetPhone: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    qrCodeDataUrl: string | null
    lastError: string | null
  }> = async () => {
    const manager = getWhatsAppChannelManager()
    await manager.ensureStarted()
    return manager.getState()
  }

  SetWhatsAppBotName: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botName: string },
  ) => {
    botName: string
    targetPhone: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    qrCodeDataUrl: string | null
    lastError: string | null
  } = (_event, args) => {
    const manager = getWhatsAppChannelManager()
    return manager.setBotName(args?.botName ?? '')
  }

  SetWhatsAppTargetPhone: (
    _event: Electron.IpcMainInvokeEvent,
    args: { targetPhone: string },
  ) => {
    botName: string
    targetPhone: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    qrCodeDataUrl: string | null
    lastError: string | null
  } = (_event, args) => {
    const manager = getWhatsAppChannelManager()
    return manager.setTargetPhone(args?.targetPhone ?? '')
  }

  RefreshWhatsAppQrCode: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    targetPhone: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    qrCodeDataUrl: string | null
    lastError: string | null
  }> = async () => {
    const manager = getWhatsAppChannelManager()
    return manager.refreshQrCode()
  }

  LogoutWhatsAppSession: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    targetPhone: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    qrCodeDataUrl: string | null
    lastError: string | null
  }> = async () => {
    const manager = getWhatsAppChannelManager()
    return manager.logoutSession()
  }

  GetWhatsAppChatMessages: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async () => {
    const manager = getWhatsAppChannelManager()
    await manager.ensureStarted()
    return manager.getChatMessages()
  }

  SendWhatsAppChatMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { text: string },
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async (_event, args) => {
    const manager = getWhatsAppChannelManager()
    return manager.sendChatMessage(args?.text ?? '')
  }

  SendWhatsAppMessageToJid: (
    _event: Electron.IpcMainInvokeEvent,
    args: { jid: string; text: string },
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async (_event, args) => {
    const manager = getWhatsAppChannelManager()
    return manager.sendMessageToJid(args?.jid ?? '', args?.text ?? '')
  }

  GetTelegramState: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getTelegramChannelManager()
    await manager.ensureStarted()
    return manager.getState()
  }

  SetTelegramBotName: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botName: string },
  ) => {
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  } = (_event, args) => {
    const manager = getTelegramChannelManager()
    return manager.setBotName(args?.botName ?? '')
  }

  SetTelegramBotToken: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botToken: string },
  ) => Promise<{
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async (_event, args) => {
    const manager = getTelegramChannelManager()
    return manager.setBotToken(args?.botToken ?? '')
  }

  StopTelegramBot: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getTelegramChannelManager()
    return manager.stop()
  }

  GetTelegramChatMessages: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async () => {
    const manager = getTelegramChannelManager()
    return manager.getChatMessages()
  }

  SendTelegramChatMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { chatId: string; text: string },
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async (_event, args) => {
    const manager = getTelegramChannelManager()
    return manager.sendMessageToChatId(args?.chatId ?? '', args?.text ?? '')
  }

  GetDiscordState: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getDiscordChannelManager()
    await manager.ensureStarted()
    return manager.getState()
  }

  SetDiscordBotName: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botName: string },
  ) => {
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  } = (_event, args) => {
    const manager = getDiscordChannelManager()
    return manager.setBotName(args?.botName ?? '')
  }

  SetDiscordBotToken: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botToken: string },
  ) => Promise<{
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async (_event, args) => {
    const manager = getDiscordChannelManager()
    return manager.setBotToken(args?.botToken ?? '')
  }

  StopDiscordBot: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    botToken: string
    botUsername: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getDiscordChannelManager()
    return manager.stop()
  }

  GetDiscordChatMessages: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async () => {
    const manager = getDiscordChannelManager()
    return manager.getChatMessages()
  }

  SendDiscordChatMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { channelId: string; text: string },
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async (_event, args) => {
    const manager = getDiscordChannelManager()
    return manager.sendMessageToChannel(args?.channelId ?? '', args?.text ?? '')
  }

  GetWeChatState: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    corpId: string
    agentId: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getWeChatChannelManager()
    await manager.ensureStarted()
    return manager.getState()
  }

  SetWeChatBotName: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botName: string },
  ) => {
    botName: string
    corpId: string
    agentId: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  } = (_event, args) => {
    const manager = getWeChatChannelManager()
    return manager.setBotName(args?.botName ?? '')
  }

  SetWeChatCredentials: (
    _event: Electron.IpcMainInvokeEvent,
    args: { corpId?: string; corpSecret?: string; agentId?: string },
  ) => Promise<{
    botName: string
    corpId: string
    agentId: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async (_event, args) => {
    const manager = getWeChatChannelManager()
    return manager.setCredentials(args ?? {})
  }

  StopWeChatBot: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    corpId: string
    agentId: string
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getWeChatChannelManager()
    return manager.stop()
  }

  GetWeChatChatMessages: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async () => {
    const manager = getWeChatChannelManager()
    return manager.getChatMessages()
  }

  SendWeChatChatMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; text: string },
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async (_event, args) => {
    const manager = getWeChatChannelManager()
    return manager.sendMessageToUser(args?.userId ?? '', args?.text ?? '')
  }

  HandleWeChatWebhook: (
    _event: Electron.IpcMainInvokeEvent,
    args: { fromUser: string; text: string; msgId: string; createTime: number },
  ) => void = (_event, args) => {
    const manager = getWeChatChannelManager()
    manager.handleIncomingWebhook({
      fromUser: args?.fromUser ?? '',
      text: args?.text ?? '',
      msgId: args?.msgId ?? '',
      createTime: args?.createTime ?? 0,
    })
  }

  GetSlackState: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    botToken: string
    appToken: string
    botUserId: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getSlackChannelManager()
    await manager.ensureStarted()
    return manager.getState()
  }

  SetSlackBotName: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botName: string },
  ) => {
    botName: string
    botToken: string
    appToken: string
    botUserId: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  } = (_event, args) => {
    const manager = getSlackChannelManager()
    return manager.setBotName(args?.botName ?? '')
  }

  SetSlackTokens: (
    _event: Electron.IpcMainInvokeEvent,
    args: { botToken?: string; appToken?: string },
  ) => Promise<{
    botName: string
    botToken: string
    appToken: string
    botUserId: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async (_event, args) => {
    const manager = getSlackChannelManager()
    return manager.setTokens(args ?? {})
  }

  StopSlackBot: (_event: Electron.IpcMainInvokeEvent) => Promise<{
    botName: string
    botToken: string
    appToken: string
    botUserId: string | null
    status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError: string | null
  }> = async () => {
    const manager = getSlackChannelManager()
    return manager.stop()
  }

  GetSlackChatMessages: (
    _event: Electron.IpcMainInvokeEvent,
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async () => {
    const manager = getSlackChannelManager()
    return manager.getChatMessages()
  }

  SendSlackChatMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { channelId: string; text: string },
  ) => Promise<
    Array<{ id: string; text: string; fromMe: boolean; timestamp: number }>
  > = async (_event, args) => {
    const manager = getSlackChannelManager()
    return manager.sendMessageToChannel(args?.channelId ?? '', args?.text ?? '')
  }

  SendChannelMessage: (
    _event: Electron.IpcMainInvokeEvent,
    args: { channelId: string; target: string; text: string },
  ) => Promise<boolean> = async (_event, args) => {
    const channelId = args?.channelId?.trim() ?? ''
    const target = args?.target?.trim() ?? ''
    const text = args?.text ?? ''
    if (!channelId || !target || !text.trim()) return false

    const sender = getChannelRegistry().get(channelId)
    if (!sender) {
      throw new Error(`Channel sender not registered: ${channelId}`)
    }

    await sender.sendToTarget(target, text)
    return true
  }

  RunAgentForConversation: (
    event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      agentId: string
      assistantMessageId: string
      userId: string
      uiMessages?: unknown[]
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
      userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
      attachmentSourcePaths?: string[]
    },
  ) => Promise<{
    finalContent: string
    hasError: boolean
    errorMessage?: string
    hitlPaused?: boolean
  }> = async (event, args) => {
    return runAgentForConversation({ ...args, webContents: event.sender })
  }

  RunSubAgentMention: (
    event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      agentId: string
      assistantMessageId: string
      userId: string
      targetAgentId: string
      task: string
      uiMessages?: unknown[]
      pendingUserMessage?: {
        id: string
        content: string
        createdAt: string
      }
      userAttachments?: import('@shared/chat/attachments').ChatAttachmentMeta[]
      attachmentSourcePaths?: string[]
    },
  ) => Promise<{
    finalContent: string
    hasError: boolean
    errorMessage?: string
    hitlPaused?: boolean
  }> = async (event, args) => {
    return runSubAgentMentionDelegation({ ...args, webContents: event.sender })
  }

  StopAgentForConversation: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => void = async (_event, args) => {
    stopAgentForConversation(args.conversationId)
  }

  WarmAgentCache: (
    _event: Electron.IpcMainInvokeEvent,
    args: { userId: string; agentId?: string },
  ) => Promise<void> = async (_event, args) => {
    // Fire-and-forget — don't await in the IPC handler so the renderer
    // isn't blocked.  warmAgentCache logs errors internally.
    void warmAgentCache({ userId: args.userId, agentId: args.agentId })
  }

  OpenFileInDefaultApp: (
    _event: Electron.IpcMainInvokeEvent,
    args: { path: string },
  ) => Promise<{ success: boolean; error?: string }> = async (
    _event,
    { path },
  ) => {
    // Accept both absolute paths and file:// URLs
    let resolved = path.trim()
    if (resolved.toLowerCase().startsWith('file://')) {
      try {
        resolved = fileURLToPath(resolved)
      } catch {
        /* keep original */
      }
    }
    const error = await shell.openPath(resolved)
    return error ? { success: false, error } : { success: true }
  }

  SaveFileAs: (
    event: Electron.IpcMainInvokeEvent,
    args: { sourcePath: string; defaultName: string },
  ) => Promise<{ savedPath: string | null }> = async (
    event,
    { sourcePath, defaultName },
  ) => {
    let resolved = sourcePath.trim()
    if (resolved.toLowerCase().startsWith('file://')) {
      try {
        resolved = fileURLToPath(resolved)
      } catch {
        /* keep original */
      }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win ?? (undefined as never), {
      defaultPath: defaultName,
      buttonLabel: 'Save',
    })
    if (result.canceled || !result.filePath) return { savedPath: null }
    await fsPromises.copyFile(resolved, result.filePath)
    return { savedPath: result.filePath }
  }

  ExportMarkdownAsPdf: (
    event: Electron.IpcMainInvokeEvent,
    args: {
      markdown: string
      defaultFileName: string
      kind?: 'default' | 'research-report'
    },
  ) => Promise<{ savedPath: string | null; error?: string }> = async (
    event,
    { markdown, defaultFileName, kind = 'default' },
  ) => {
    const body = markdown.trim()
    if (!body) {
      return { savedPath: null, error: 'No content to export' }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win ?? (undefined as never), {
      defaultPath: defaultFileName,
      buttonLabel: 'Save',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || !result.filePath) {
      return { savedPath: null }
    }
    try {
      await exportMarkdownBodyToPdf(body, result.filePath, kind)
      return { savedPath: result.filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { savedPath: null, error: message }
    }
  }

  SyncSandboxOutputView: (
    event: Electron.IpcMainInvokeEvent,
    args: {
      screenBounds: { x: number; y: number; width: number; height: number }
      fileUrl: string | null
      markdownView?: 'html' | 'raw'
    },
  ) => void = async (event, args) => {
    await syncSandboxOutputView(event, args)
  }

  RemoveSandboxDirectories: (
    _event: Electron.IpcMainInvokeEvent,
    args: { paths: string[] },
  ) => Promise<void> = async (_event, args) => {
    await removeSandboxDirectories(args?.paths ?? [])
  }

  SelectWorkspaceFolder: (
    event: Electron.IpcMainInvokeEvent,
  ) => Promise<{ path: string | null }> = async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory'],
      title: 'Select Workspace Folder',
      buttonLabel: 'Select Folder',
    })
    if (result.canceled || !result.filePaths[0]) return { path: null }
    return { path: result.filePaths[0] }
  }

  GetConversationWorkspace: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => {
    stack: ReturnType<typeof getWorkspaceStack>
    workspacePath: string | null
  } = (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    loadConversationWorkspace(conversationId)
    const workspacePath = getWorkspacePath(conversationId)
    // Pre-warm language servers for the workspace so they're ready before the
    // first edit/query. Fire-and-forget; no-op when already started.
    if (workspacePath) getLspManager().prewarm(workspacePath)
    return {
      stack: getWorkspaceStack(conversationId),
      workspacePath,
    }
  }

  SetConversationWorkspace: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; path: string },
  ) => ReturnType<typeof setWorkspacePath> = (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }
    if (isConversationRunInFlight(conversationId)) {
      return {
        ok: false,
        error:
          'Cannot change workspace while the agent is running for this conversation.',
      }
    }
    const result = setWorkspacePath(conversationId, args?.path ?? '')
    // Pre-warm language servers as soon as the user picks a workspace folder.
    if (result.ok && result.workspacePath) {
      getLspManager().prewarm(result.workspacePath)
    }
    return result
  }

  ClearConversationWorkspace: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => ReturnType<typeof clearWorkspacePath> = (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }
    if (isConversationRunInFlight(conversationId)) {
      return {
        ok: false,
        error:
          'Cannot change workspace while the agent is running for this conversation.',
      }
    }
    return clearWorkspacePath(conversationId)
  }

  // ── Workspace git IPC handlers ────────────────────────────────────────────

  GetWorkspaceGitStatus: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => Promise<GitStatusResult & { ok: boolean; error?: string }> = async (
    _event,
    args,
  ) => {
    const resolved = resolveWorkspaceCwd(args?.conversationId ?? '')
    if (!resolved.ok) {
      return {
        ok: false,
        branch: '',
        upstream: null,
        ahead: 0,
        behind: 0,
        entries: [],
        clean: false,
        error: resolved.error,
      }
    }
    try {
      const result = await gitStatus(resolved.cwd)
      return { ok: true, ...result }
    } catch (err) {
      return {
        ok: false,
        branch: '',
        upstream: null,
        ahead: 0,
        behind: 0,
        entries: [],
        clean: false,
        error: String(err),
      }
    }
  }

  GetWorkspaceGitDiff: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; staged?: boolean; files?: string[] },
  ) => Promise<{ ok: boolean; diff: string; error?: string }> = async (
    _event,
    args,
  ) => {
    const resolved = resolveWorkspaceCwd(args?.conversationId ?? '')
    if (!resolved.ok) return { ok: false, diff: '', error: resolved.error }
    try {
      const result = await gitDiff(resolved.cwd, {
        staged: args.staged,
        files: args.files,
      })
      if (!result.ok) return { ok: false, diff: '', error: result.error }
      return { ok: true, diff: result.diff }
    } catch (err) {
      return { ok: false, diff: '', error: String(err) }
    }
  }

  GetWorkspaceGitLog: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; limit?: number },
  ) => Promise<{
    ok: boolean
    commits: Awaited<ReturnType<typeof gitLog>>
    error?: string
  }> = async (_event, args) => {
    const resolved = resolveWorkspaceCwd(args?.conversationId ?? '')
    if (!resolved.ok) return { ok: false, commits: [], error: resolved.error }
    try {
      const commits = await gitLog(resolved.cwd, args.limit ?? 20)
      return { ok: true, commits }
    } catch (err) {
      return { ok: false, commits: [], error: String(err) }
    }
  }

  RunWorkspaceGitAdd: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; files?: string[] },
  ) => Promise<{ ok: boolean; output?: string; error?: string }> = async (
    _event,
    args,
  ) => {
    const resolved = resolveWorkspaceCwd(args?.conversationId ?? '', {
      blockIfRunInFlight: true,
    })
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const result = await gitAdd(resolved.cwd, args.files ?? [])
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, output: result.stdout }
  }

  RunWorkspaceGitCommit: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; message: string },
  ) => Promise<{
    ok: boolean
    hash?: string
    output?: string
    error?: string
  }> = async (_event, args) => {
    const resolved = resolveWorkspaceCwd(args?.conversationId ?? '', {
      blockIfRunInFlight: true,
    })
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const message = args?.message?.trim()
    if (!message)
      return { ok: false, error: 'Commit message must not be empty.' }
    const result = await gitCommit(resolved.cwd, message)
    if (!result.ok) return { ok: false, error: result.error }
    const hashMatch = result.stdout.match(/\[(?:[^\]]*)\s+([0-9a-f]+)\]/)
    return { ok: true, hash: hashMatch?.[1], output: result.stdout }
  }

  RunWorkspaceGitPush: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      remote?: string
      branch?: string
      setUpstream?: boolean
    },
  ) => Promise<{ ok: boolean; output?: string; error?: string }> = async (
    _event,
    args,
  ) => {
    const resolved = resolveWorkspaceCwd(args?.conversationId ?? '', {
      blockIfRunInFlight: true,
    })
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const result = await gitPush(resolved.cwd, {
      remote: args.remote,
      branch: args.branch,
      setUpstream: args.setUpstream,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, output: result.stdout || result.stderr }
  }

  RunWorkspaceGitCreatePR: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      title: string
      body: string
      base?: string
      draft?: boolean
    },
  ) => Promise<{ ok: boolean; url?: string; output?: string; error?: string }> =
    async (_event, args) => {
      const resolved = resolveWorkspaceCwd(args?.conversationId ?? '', {
        blockIfRunInFlight: true,
      })
      if (!resolved.ok) return { ok: false, error: resolved.error }
      const result = await ghCreatePr(resolved.cwd, {
        title: args.title,
        body: args.body,
        base: args.base,
        draft: args.draft,
      })
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, url: result.url, output: result.url }
    }

  ListWorkspaceFiles: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath?: string },
  ) => Promise<{
    ok: boolean
    entries: Array<{
      path: string
      name: string
      isDir: boolean
      gitStatus?: string
    }>
    error?: string
  }> = async (_event, args) => {
    const resolved = await ensureFilesCwd(args?.conversationId ?? '')
    if (!resolved.ok) return { ok: false, entries: [], error: resolved.error }
    const listed = await listWorkspaceFiles(
      resolved.cwd,
      args.relativePath ?? '.',
    )
    if (!listed.ok) return { ok: false, entries: [], error: listed.error }
    return { ok: true, entries: listed.entries }
  }

  SearchWorkspaceFiles: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; query?: string; limit?: number },
  ) => Promise<{ ok: boolean; paths: string[]; error?: string }> = async (
    _event,
    args,
  ) => {
    const resolved = resolveFilesCwd(args?.conversationId ?? '')
    if (!resolved.ok) return { ok: false, paths: [], error: resolved.error }
    const searched = await searchWorkspaceFiles(
      resolved.cwd,
      args?.query ?? '',
      { limit: args?.limit },
    )
    if (!searched.ok) return { ok: false, paths: [], error: searched.error }
    return { ok: true, paths: searched.paths }
  }

  PickChatAttachments: (
    event: Electron.IpcMainInvokeEvent,
  ) => Promise<{ ok: boolean; paths: string[]; error?: string }> = async (
    event,
  ) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openFile', 'multiSelections'],
      title: 'Attach files',
      buttonLabel: 'Attach',
      filters: buildPickChatAttachmentDialogFilters(),
    })
    if (result.canceled) return { ok: true, paths: [] }
    return { ok: true, paths: result.filePaths ?? [] }
  }

  IngestChatAttachments: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      messageId: string
      sourcePaths: string[]
    },
  ) => Promise<{
    ok: boolean
    attachments: import('@shared/chat/attachments').ChatAttachmentMeta[]
    error?: string
  }> = async (_event, args) => {
    return ingestChatAttachments({
      conversationId: args?.conversationId ?? '',
      messageId: args?.messageId ?? '',
      sourcePaths: args?.sourcePaths ?? [],
    })
  }

  GetConversationAttachments: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => Promise<{
    ok: boolean
    attachments: import('@shared/chat/attachments').ChatAttachmentMeta[]
    error?: string
  }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, attachments: [], error: 'conversationId is required.' }
    }
    return { ok: true, attachments: listConversationAttachmentMetas(conversationId) }
  }

  SearchChatAttachments: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; query?: string; limit?: number },
  ) => Promise<{ ok: boolean; paths: string[]; error?: string }> = async (
    _event,
    args,
  ) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) return { ok: false, paths: [], error: 'conversationId is required.' }
    const paths = searchChatAttachments(
      conversationId,
      args?.query ?? '',
      args?.limit,
    )
    return { ok: true, paths }
  }

  RevealChatAttachment: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; sandboxPath: string },
  ) => Promise<{ ok: boolean; error?: string }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    const sandboxPath = args?.sandboxPath?.trim() ?? ''
    if (!conversationId || !sandboxPath) {
      return { ok: false, error: 'conversationId and sandboxPath are required.' }
    }
    try {
      const abs = resolveChatAttachmentAbsolutePath({ conversationId, sandboxPath })
      shell.showItemInFolder(abs)
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  }

  AddSessionToolApproval: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; toolName: string },
  ) => { ok: boolean; tools: string[] } = (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    const toolName = args?.toolName?.trim() ?? ''
    if (!conversationId || !toolName) return { ok: false, tools: [] }
    const tools = addSessionApprovedTool(conversationId, toolName)
    return { ok: true, tools }
  }

  CompactConversation: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; hint?: string; userId?: string },
  ) => Promise<{
    ok: boolean
    compacted: boolean
    message?: string
    error?: string
  }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return {
        ok: false,
        compacted: false,
        error: 'conversationId is required',
      }
    }
    return compactStoredConversation({
      conversationId,
      userId: args?.userId?.trim() || 'default',
      hint: args?.hint,
    })
  }

  GetCodingMode: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => { ok: boolean; mode: import('@shared/agent/coding-mode').CodingMode } = (
    _event,
    args,
  ) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) return { ok: false, mode: 'normal' }
    const mode =
      getConversationStore().getConversationCodingMode(conversationId)
    return { ok: true, mode }
  }

  SetCodingMode: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      mode: import('@shared/agent/coding-mode').CodingMode
    },
  ) => { ok: boolean; mode: import('@shared/agent/coding-mode').CodingMode } = (
    _event,
    args,
  ) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    const mode = args?.mode ?? 'normal'
    if (!conversationId) return { ok: false, mode: 'normal' }
    const saved = getConversationStore().setConversationCodingMode(
      conversationId,
      mode,
    )
    return { ok: true, mode: saved.codingMode }
  }

  GetPlanModeState: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => {
    ok: boolean
    view: import('@shared/agent/plan-mode-phase').PlanModeView
  } = (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, view: defaultPlanModeView() }
    }
    clearPlanExecutionIfAllDone(
      conversationId,
      planModeStorageOptionsFromEnv(conversationId),
    )
    return { ok: true, view: getPlanModeView(conversationId) }
  }

  TransitionPlanMode: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      action: import('@shared/agent/plan-mode-phase').PlanModeTransition
    },
  ) => Promise<{
    ok: boolean
    view: import('@shared/agent/plan-mode-phase').PlanModeView
  }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    const action = args?.action
    if (!conversationId || !action) {
      return { ok: false, view: defaultPlanModeView() }
    }
    const sandbox = await getOrCreateSandboxForConversation(conversationId)
    const storageOptions = { sandboxRoot: sandbox.layout.root }

    const view = transitionPlanMode(conversationId, action, {
      trigger: 'ipc:TransitionPlanMode',
      reason: action,
    })
    if (action === 'activatePlanning') {
      bootstrapPlanModeStorage(conversationId, undefined, storageOptions)
    }
    if (action === 'resetToIdle') {
      clearPlanModeTodoArtifacts(conversationId, storageOptions)
    }
    return { ok: true, view }
  }

  ListBackgroundTasks: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId?: string },
  ) => import('@main/agent/background/background-task-manager').BackgroundTask[] =
    (_event, args) => listBackgroundTasks(args?.conversationId)

  CancelBackgroundTask: (
    _event: Electron.IpcMainInvokeEvent,
    args: { taskId: string },
  ) => { ok: boolean } = (_event, args) => {
    const taskId = args?.taskId?.trim() ?? ''
    if (!taskId) return { ok: false }
    return { ok: cancelBackgroundTask(taskId) }
  }

  InstallSkillFromGithub: (
    _event: Electron.IpcMainInvokeEvent,
    args: { url: string; skillId?: string },
  ) => Promise<{ ok: boolean; skillId?: string; error?: string }> = async (
    _event,
    args,
  ) =>
    installSkillFromGithub({
      url: args?.url ?? '',
      skillId: args?.skillId,
    })

  SearchClawHubSkills: (
    _event: Electron.IpcMainInvokeEvent,
    args: { query: string; limit?: number },
  ) => ReturnType<typeof searchClawHubSkills> = async (_event, args) =>
    searchClawHubSkills({
      query: args?.query ?? '',
      limit: args?.limit,
    })

  GetClawHubSkill: (
    _event: Electron.IpcMainInvokeEvent,
    args: { slug: string },
  ) => ReturnType<typeof getClawHubSkillDetail> = async (_event, args) =>
    getClawHubSkillDetail(args?.slug ?? '')

  PreviewClawHubSkillFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { slug: string; path?: string },
  ) => ReturnType<typeof previewClawHubSkillFile> = async (_event, args) =>
    previewClawHubSkillFile({
      slug: args?.slug ?? '',
      path: args?.path,
    })

  InstallClawHubSkill: (
    _event: Electron.IpcMainInvokeEvent,
    args: { slug: string; localSkillId?: string; version?: string },
  ) => ReturnType<typeof installClawHubSkill> = async (_event, args) =>
    installClawHubSkill({
      slug: args?.slug ?? '',
      localSkillId: args?.localSkillId,
      version: args?.version,
    })

  ListClawHubInstalledSkills: (
    _event: Electron.IpcMainInvokeEvent,
  ) => ReturnType<typeof listClawHubInstalledSkills> = async () =>
    listClawHubInstalledSkills()

  UpdateClawHubSkill: (
    _event: Electron.IpcMainInvokeEvent,
    args: { localSkillId: string },
  ) => ReturnType<typeof updateClawHubSkill> = async (_event, args) =>
    updateClawHubSkill({ localSkillId: args?.localSkillId ?? '' })

  UpdateAllClawHubSkills: (
    _event: Electron.IpcMainInvokeEvent,
  ) => ReturnType<typeof updateAllClawHubSkills> = async () =>
    updateAllClawHubSkills()

  UninstallClawHubSkill: (
    _event: Electron.IpcMainInvokeEvent,
    args: { localSkillId: string },
  ) => ReturnType<typeof uninstallClawHubSkill> = async (_event, args) =>
    uninstallClawHubSkill({ localSkillId: args?.localSkillId ?? '' })

  OpenWorkspaceFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath: string },
  ) => Promise<{ ok: boolean; error?: string }> = async (_event, args) => {
    const resolved = resolveFilesFileOpen(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
    )
    if (!resolved.ok) {
      return { ok: false, error: resolved.error }
    }
    const absolutePath = resolved.absolutePath
    if (!absolutePath) {
      return { ok: false, error: 'Failed to resolve file path.' }
    }
    try {
      await shell.openPath(absolutePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  ReadWorkspaceFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath: string },
  ) => Promise<{
    ok: boolean
    content?: string
    size?: number
    fileUrl?: string
    error?: string
    binary?: boolean
  }> = async (_event, args) => {
    const resolvedFile = resolveFilesFileOpen(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
    )
    const fileUrl =
      resolvedFile.ok && resolvedFile.absolutePath
        ? pathToFileURL(resolvedFile.absolutePath).toString()
        : undefined

    const resolved = resolveFilesCwd(args?.conversationId ?? '')
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const read = await readWorkspaceFileContent(
      resolved.cwd,
      args?.relativePath ?? '',
    )
    if (!read.ok) {
      return {
        ok: false,
        error: read.error,
        binary: read.binary,
        fileUrl,
      }
    }
    return {
      ok: true,
      content: read.content,
      size: read.size,
      fileUrl,
    }
  }

  WriteWorkspaceFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath: string; content: string },
  ) => Promise<{ ok: boolean; error?: string }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }
    if (isConversationRunInFlight(conversationId)) {
      return {
        ok: false,
        error:
          'Cannot change workspace or git state while the agent is running for this conversation.',
      }
    }
    const resolved = resolveFilesCwd(conversationId)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    return writeWorkspaceFileContent(
      resolved.cwd,
      args?.relativePath ?? '',
      args?.content ?? '',
    )
  }

  RunWorkspaceTerminalCommand: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; command: string; relativeCwd?: string },
  ) => Promise<{
    ok: boolean
    cwd?: string
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
  }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }
    if (isConversationRunInFlight(conversationId)) {
      return {
        ok: false,
        error:
          'Cannot change workspace or git state while the agent is running for this conversation.',
      }
    }
    const resolved = resolveFilesCwd(conversationId)
    if (!resolved.ok) return { ok: false, error: resolved.error }

    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId,
      workspaceCwd: resolved.cwd,
      command: args?.command ?? '',
      relativeCwd: args?.relativeCwd ?? '.',
    })
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        cwd: result.cwd,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    }
    return {
      ok: true,
      cwd: result.cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  CancelWorkspaceTerminalCommand: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => { ok: boolean; error?: string } = (_event, args) =>
    cancelWorkspaceTerminalCommand(args?.conversationId ?? '')

  StartWorkspaceTerminalSession: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      relativeCwd?: string
      shell?: string | null
      cols?: number
      rows?: number
    },
  ) => { ok: boolean; cwd?: string; shell?: string; error?: string } = (
    _event,
    args,
  ) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId)
      return { ok: false, error: 'conversationId is required.' }
    const resolved = resolveFilesCwd(conversationId)
    if (!resolved.ok) return { ok: false, error: resolved.error }

    return startWorkspaceTerminalSession({
      conversationId,
      workspaceCwd: resolved.cwd,
      relativeCwd: args?.relativeCwd ?? '.',
      shell: args?.shell ?? null,
      cols: args?.cols,
      rows: args?.rows,
    })
  }

  WriteWorkspaceTerminalInput: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; data: string },
  ) => { ok: boolean; error?: string } = (_event, args) =>
    writeWorkspaceTerminalInput({
      conversationId: args?.conversationId ?? '',
      data: args?.data ?? '',
    })

  ResizeWorkspaceTerminalSession: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; cols: number; rows: number },
  ) => { ok: boolean; error?: string } = (_event, args) =>
    resizeWorkspaceTerminalSession({
      conversationId: args?.conversationId ?? '',
      cols: Number(args?.cols ?? 0),
      rows: Number(args?.rows ?? 0),
    })

  StopWorkspaceTerminalSession: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => { ok: boolean; error?: string } = (_event, args) =>
    stopWorkspaceTerminalSession(args?.conversationId ?? '')

  EditorLspStartSession: (
    event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; workspaceRoot?: string },
  ) => { ok: boolean; error?: string } = (event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }
    const resolved = resolveFilesCwd(conversationId)
    const workspaceRoot =
      args?.workspaceRoot?.trim() ||
      (resolved.ok ? resolved.cwd : (getWorkspacePath(conversationId) ?? ''))
    if (!workspaceRoot) {
      return { ok: false, error: 'No workspace folder is selected.' }
    }
    return getEditorLspBridge().startSession(
      conversationId,
      workspaceRoot,
      event.sender,
    )
  }

  EditorLspStopSession: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => { ok: boolean; error?: string } = (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }
    getEditorLspBridge().stopSession(conversationId)
    return { ok: true }
  }

  EditorLspSyncDocument: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      relativePath: string
      content: string
      languageId: string
    },
  ) => { ok: boolean; error?: string } = (_event, args) =>
    getEditorLspBridge().queueSyncDocument(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
      args?.content ?? '',
      args?.languageId ?? '',
    )

  EditorLspCloseDocument: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath: string },
  ) => { ok: boolean; error?: string } = (_event, args) =>
    getEditorLspBridge().closeDocument(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
    )

  EditorLspRequest: (
    _event: Electron.IpcMainInvokeEvent,
    args: {
      conversationId: string
      relativePath: string
      method: string
      params: unknown
    },
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }> = async (
    _event,
    args,
  ) =>
    getEditorLspBridge().request(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
      args?.method ?? '',
      args?.params,
    )

  FormatWorkspaceFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath: string; content: string },
  ) => ReturnType<typeof formatWorkspaceFile> = (_event, args) =>
    formatWorkspaceFile(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
      args?.content ?? '',
    )

  LintWorkspaceFile: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; relativePath: string; content: string },
  ) => ReturnType<typeof lintWorkspaceFile> = (_event, args) =>
    lintWorkspaceFile(
      args?.conversationId ?? '',
      args?.relativePath ?? '',
      args?.content ?? '',
    )

  PickWorkspaceEditorFile: (
    event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string },
  ) => Promise<{ ok: boolean; relativePath?: string | null; error?: string }> =
    async (event, args) => {
      const resolved = resolveFilesCwd(args?.conversationId ?? '')
      if (!resolved.ok) return { ok: false, error: resolved.error }

      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win ?? undefined, {
        properties: ['openFile'],
        defaultPath: resolved.cwd,
        title: 'Open File',
        buttonLabel: 'Open',
      })
      if (result.canceled || !result.filePaths[0]) {
        return { ok: true, relativePath: null }
      }

      const rel = relative(resolved.cwd, result.filePaths[0]).replace(
        /\\/g,
        '/',
      )
      if (!rel || rel.startsWith('..')) {
        return {
          ok: false,
          error: 'Selected file must be inside the workspace.',
        }
      }
      return { ok: true, relativePath: rel }
    }

  EditorLspWorkspaceSymbols: (
    _event: Electron.IpcMainInvokeEvent,
    args: { conversationId: string; query?: string },
  ) => Promise<{
    ok: boolean
    symbols?: Array<{
      name: string
      kind: string
      path: string
      line: number
      character: number
      container?: string
    }>
    error?: string
  }> = async (_event, args) => {
    const conversationId = args?.conversationId?.trim() ?? ''
    if (!conversationId) {
      return { ok: false, error: 'conversationId is required.' }
    }

    const resolved = resolveFilesCwd(conversationId)
    if (!resolved.ok) return { ok: false, error: resolved.error }

    getEditorLspBridge().startSession(conversationId, resolved.cwd, null)

    const result = await getLspManager().queryWorkspaceSymbols(
      resolved.cwd,
      args?.query ?? '',
      { conversationId },
    )
    if (!result.ok) return result
    return {
      ok: true,
      symbols: result.symbols.map((sym) => ({
        name: sym.name,
        kind: sym.kind,
        path: sym.path,
        line: sym.line,
        character: sym.character,
        container: sym.container,
      })),
    }
  }
}
