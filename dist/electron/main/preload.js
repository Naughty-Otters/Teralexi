'use strict';

var electron = require('electron');
var os = require('os');

class IpcChannelMainClass {
  constructor() {
    this.GetSystemConfig = null;
    this.GetSystemConfigs = null;
    this.SetSystemConfig = null;
    this.IsUseSysTitle = null;
    /**
     * Exit application
     */
    this.AppClose = null;
    this.CheckUpdate = null;
    this.ConfirmUpdate = null;
    this.DownloadUpdate = null;
    this.GetAppVersion = null;
    this.GetSupportConfig = null;
    this.ReportClientError = null;
    this.SubmitSupportReport = null;
    this.OpenMessagebox = null;
    this.StartDownload = null;
    this.OpenErrorbox = null;
    this.StartServer = null;
    this.StopServer = null;
    this.HotUpdate = null;
    /**
     * Load all skills from the skills directory and return them as Agent objects
     */
    this.LoadSkills = null;
    this.ListWorkflowPanelSkills = null;
    /**
     * List persisted agent configurations for a user
     */
    this.ListAgentConfigurations = null;
    /**
     * Persist a full editable agent configuration (upsert)
     */
    this.UpsertAgentConfiguration = null;
    /**
     * Delete a persisted agent configuration
     */
    this.DeleteAgentConfiguration = null;
    /**
     * List all tools available in the shared toolSet (toolSet/index.ts)
     */
    this.ListToolSetTools = null;
    /**
     * Execute a single tool from a skill action folder.
     */
    this.CallSkillTool = null;
    /**
     * Return the resolved path to the skills directory
     */
    this.GetSkillsDir = null;
    /**
     * List read-only skill attachments (refs, scripts, forms) for settings UI.
     */
    this.ListSkillAttachments = null;
    /**
     * Read a skill attachment for download (utf8 text or base64 binary).
     */
    this.ReadSkillAttachment = null;
    /**
     * Read skill compilation status and structured artifact for settings review.
     */
    this.GetSkillCompilation = null;
    /**
     * Compile skill sources into the structured artifact (manual; not run on app load).
     * When `force` is false, skips LLM if DB row matches current source fingerprint.
     */
    this.CompileSkill = null;
    /** List all loadable skills with compilation status (settings Skills tab). */
    this.ListSkillCompilations = null;
    /** Compile every loadable skill (manual bulk action). */
    this.CompileAllSkills = null;
    /** Force recompile skill sources (same as CompileSkill with force: true). */
    this.RecompileSkill = null;
    /** Save user-edited compiled artifact without re-running compile LLM. */
    this.SaveSkillCompilation = null;
    /**
     * Small screenshot / thumbnail for a sandbox output file (image, HTML, PDF).
     */
    this.GetStepOutputLinkPreview = null;
    /**
     * Dry-run preview for file edit/write/patch tools (no writes).
     */
    this.PreviewFileChange = null;
    /** Dry-run preview for exit_plan_mode approval (plan markdown + todos). */
    this.PreviewPlanApproval = null;
    /**
     * List all conversations for a given agent, ordered by most recent
     */
    this.ListConversations = null;
    /**
     * Create a new conversation record
     */
    this.CreateConversation = null;
    /**
     * Update the title of an existing conversation
     */
    this.UpdateConversationTitle = null;
    /**
     * Update which agent/skill owns a conversation (persisted per conversation).
     */
    this.UpdateConversationAgent = null;
    /**
     * Load conversation metadata (agent binding, title, timestamps).
     */
    this.GetConversationMeta = null;
    /**
     * Delete a conversation and all its messages
     */
    this.DeleteConversation = null;
    /**
     * Clear chat history only — keeps conversation, workspace, and agent binding.
     */
    this.ClearConversationHistory = null;
    /**
     * Persisted sandbox runs for a conversation (report panel + cleanup).
     */
    this.GetConversationSandboxRuns = null;
    /**
     * Load all persisted messages for a given conversation
     */
    this.GetConversation = null;
    /**
     * Paginated message history (latest page or older rows before a timestamp).
     */
    this.GetConversationMessagesPage = null;
    /**
     * Persist a single message
     */
    this.SaveMessage = null;
    /**
     * LLM token usage dashboard: overview stats and daily model breakdown.
     */
    this.ListTokenUsageChart = null;
    /**
     * Update an existing message's content
     */
    this.UpdateMessage = null;
    /**
     * Get all user property key-value pairs for a user
     */
    this.GetUserProperties = null;
    /**
     * Get all user properties with metadata for a user
     */
    this.ListUserProperties = null;
    /**
     * Get a single user property by key
     */
    this.GetUserProperty = null;
    /**
     * Set a user property key-value pair (upsert)
     */
    this.SetUserProperty = null;
    /**
     * Delete a single user property by key
     */
    this.DeleteUserProperty = null;
    /**
     * Delete all user properties for a user
     */
    this.ClearUserProperties = null;
    /**
     * List all stored MCP servers for a user
     */
    this.ListMcpServers = null;
    /**
     * Create a new MCP server definition
     */
    this.CreateMcpServer = null;
    /**
     * Enable or disable an MCP server
     */
    this.SetMcpServerEnabled = null;
    /**
     * Delete an MCP server definition
     */
    this.DeleteMcpServer = null;
    /**
     * Discover tools exposed by a specific MCP server
     */
    this.GetMcpServerTools = null;
    /**
     * Execute one tool call on a specific MCP server
     */
    this.CallMcpServerTool = null;
    /**
     * Search the official MCP Registry for installable servers
     */
    this.SearchMcpRegistry = null;
    /**
     * Load configuration drafts for a registry server
     */
    this.GetMcpRegistryServer = null;
    /**
     * Save arbitrary data to a file under user.workspace
     */
    this.SaveDataToFile = null;
    /**
     * List persisted scheduler definitions
     */
    this.ListSchedulers = null;
    /**
     * Create or update one scheduler definition
     */
    this.UpsertScheduler = null;
    /**
     * Delete one scheduler definition
     */
    this.DeleteScheduler = null;
    this.ListWorkflows = null;
    this.GetWorkflowSnapshot = null;
    this.CompileWorkflow = null;
    this.RunWorkflowCompilerAgent = null;
    this.ConfirmWorkflowVersion = null;
    this.SaveWorkflowDefinitionJson = null;
    this.RunWorkflowTest = null;
    this.DeployWorkflow = null;
    this.UndeployWorkflow = null;
    this.RunWorkflowManual = null;
    this.DeleteWorkflow = null;
    this.CreateWorkflowDraft = null;
    /**
     * Window ready
     */
    this.WinReady = null;
    /**
     *
     * Open window
     */
    this.OpenWin = null;
    /**
     * Start Google OAuth2 sign-in flow, returns the authenticated account info
     */
    this.GoogleSignIn = null;
    /**
     * Sign out and clear stored Google account tokens
     */
    this.GoogleSignOut = null;
    /**
     * Return the currently stored Google account info, or null if not signed in
     */
    this.GetGoogleAccount = null;
    /**
     * Start GitHub OAuth2 sign-in flow, returns the authenticated account info
     */
    this.GitHubSignIn = null;
    /**
     * Sign out and clear stored GitHub account tokens
     */
    this.GitHubSignOut = null;
    /**
     * Return the currently stored GitHub account info, or null if not signed in
     */
    this.GetGitHubAccount = null;
    /**
     * Return current WhatsApp integration state
     */
    this.GetWhatsAppState = null;
    /**
     * Save the WhatsApp bot display name
     */
    this.SetWhatsAppBotName = null;
    /**
     * Save the WhatsApp target phone number used by mini chat
     */
    this.SetWhatsAppTargetPhone = null;
    /**
     * Refresh WhatsApp QR code by restarting the socket session
     */
    this.RefreshWhatsAppQrCode = null;
    /**
     * Log out WhatsApp and clear local auth session
     */
    this.LogoutWhatsAppSession = null;
    /**
     * Get WhatsApp mini chat messages
     */
    this.GetWhatsAppChatMessages = null;
    /**
     * Send one WhatsApp chat message and return updated messages
     */
    this.SendWhatsAppChatMessage = null;
    /**
     * Send one WhatsApp message to a specific JID and return updated mini chat messages
     */
    this.SendWhatsAppMessageToJid = null;
    /**
     * Return current Telegram bot integration state
     */
    this.GetTelegramState = null;
    /**
     * Save the Telegram bot display name
     */
    this.SetTelegramBotName = null;
    /**
     * Save the Telegram bot token and restart the bot
     */
    this.SetTelegramBotToken = null;
    /**
     * Stop the Telegram bot
     */
    this.StopTelegramBot = null;
    /**
     * Get Telegram mini chat messages
     */
    this.GetTelegramChatMessages = null;
    /**
     * Send one Telegram chat message and return updated messages
     */
    this.SendTelegramChatMessage = null;
    /**
     * Return current Discord bot integration state
     */
    this.GetDiscordState = null;
    /**
     * Save the Discord bot display name
     */
    this.SetDiscordBotName = null;
    /**
     * Save the Discord bot token and restart the bot
     */
    this.SetDiscordBotToken = null;
    /**
     * Stop the Discord bot
     */
    this.StopDiscordBot = null;
    /**
     * Get Discord mini chat messages
     */
    this.GetDiscordChatMessages = null;
    /**
     * Send one Discord chat message and return updated messages
     */
    this.SendDiscordChatMessage = null;
    /**
     * Return current WeChat Work bot integration state
     */
    this.GetWeChatState = null;
    /**
     * Save the WeChat bot display name
     */
    this.SetWeChatBotName = null;
    /**
     * Save WeChat Work credentials (corpId, corpSecret, agentId) and reconnect
     */
    this.SetWeChatCredentials = null;
    /**
     * Stop the WeChat bot
     */
    this.StopWeChatBot = null;
    /**
     * Get WeChat mini chat messages
     */
    this.GetWeChatChatMessages = null;
    /**
     * Send one WeChat message to a user and return updated messages
     */
    this.SendWeChatChatMessage = null;
    /**
     * Handle an incoming WeChat webhook payload
     */
    this.HandleWeChatWebhook = null;
    /**
     * Return current Slack bot integration state
     */
    this.GetSlackState = null;
    /**
     * Save the Slack bot display name
     */
    this.SetSlackBotName = null;
    /**
     * Save the Slack bot tokens and restart the bot
     */
    this.SetSlackTokens = null;
    /**
     * Stop the Slack bot
     */
    this.StopSlackBot = null;
    /**
     * Get Slack mini chat messages
     */
    this.GetSlackChatMessages = null;
    /**
     * Send one Slack chat message and return updated messages
     */
    this.SendSlackChatMessage = null;
    /**
     * Send one message through any registered channel target
     */
    this.SendChannelMessage = null;
    /**
     * Run the agent engine for a conversation (main process)
     */
    this.RunAgentForConversation = null;
    /**
     * Directly delegate to a catalog sub-agent from an @mention in the composer.
     */
    this.RunSubAgentMention = null;
    /**
     * Stop a running agent for a conversation
     */
    this.StopAgentForConversation = null;
    /**
     * Pre-warm the in-process cache for a user+agent before the first message.
     * Called by the renderer when the user switches to an agent or opens the chat panel.
     * Fire-and-forget; the handler never throws.
     */
    this.WarmAgentCache = null;
    /**
     * Open a file (absolute path or file:// URL) in the OS default application.
     * Returns success=false with an error message when the OS rejects the path.
     */
    this.OpenFileInDefaultApp = null;
    /**
     * Show a Save-As dialog and copy a sandbox file to the user-chosen location.
     * Returns the saved path, or null when the user cancels.
     */
    this.SaveFileAs = null;
    /**
     * Render markdown to PDF and save via a native Save-As dialog.
     * Returns the saved path, or null when the user cancels.
     */
    this.ExportMarkdownAsPdf = null;
    /**
     * Position the sandbox results WebContentsView over the given screen rect (or hide).
     */
    this.SyncSandboxOutputView = null;
    /**
     * Delete on-disk sandbox directories (validated under `~/.openfde/workspace/sandbox/` or legacy tmpdir).
     */
    this.RemoveSandboxDirectories = null;
    /**
     * Open a native folder-picker dialog and return the chosen path (or null on cancel).
     */
    this.SelectWorkspaceFolder = null;
    /** Per-conversation workspace (session) settings. */
    this.GetConversationWorkspace = null;
    this.SetConversationWorkspace = null;
    this.ClearConversationWorkspace = null;
    // ── Workspace git operations (UI → main process, no agent required) ─────────
    /** git status for the conversation workspace (path resolved in main). */
    this.GetWorkspaceGitStatus = null;
    /** git diff (unstaged or staged) for the workspace. */
    this.GetWorkspaceGitDiff = null;
    /** git log for the workspace. */
    this.GetWorkspaceGitLog = null;
    /** git add files (or all) in the workspace. */
    this.RunWorkspaceGitAdd = null;
    /** git commit staged changes in the workspace. */
    this.RunWorkspaceGitCommit = null;
    /** git push the current branch to remote. */
    this.RunWorkspaceGitPush = null;
    /** Create a GitHub PR via `gh pr create`. */
    this.RunWorkspaceGitCreatePR = null;
    /** List immediate children under a workspace path (filesystem + git status badges). */
    this.ListWorkspaceFiles = null;
    /** Fuzzy file search for composer `@file` mentions. */
    this.SearchWorkspaceFiles = null;
    /** Open a workspace file in the OS default application. */
    this.OpenWorkspaceFile = null;
    /** Read workspace file text for the in-app editor. */
    this.ReadWorkspaceFile = null;
    /** Write workspace file text from the in-app editor. */
    this.WriteWorkspaceFile = null;
    /** Run a shell command in the workspace files panel context. */
    this.RunWorkspaceTerminalCommand = null;
    /** Interrupt currently running workspace terminal command (Ctrl+C semantics). */
    this.CancelWorkspaceTerminalCommand = null;
    /** Start or restart a persistent PTY session for workspace terminal. */
    this.StartWorkspaceTerminalSession = null;
    /** Write keyboard input bytes into the persistent PTY session. */
    this.WriteWorkspaceTerminalInput = null;
    /** Resize PTY dimensions to match xterm viewport. */
    this.ResizeWorkspaceTerminalSession = null;
    /** Stop and dispose persistent PTY session for the conversation. */
    this.StopWorkspaceTerminalSession = null;
    /** Approve a tool type for the rest of the conversation (session-scoped HITL). */
    this.AddSessionToolApproval = null;
    /** Manually compact persisted conversation history (`/compact`). */
    this.CompactConversation = null;
    /** Get Kimi-like coding mode for a conversation. */
    this.GetCodingMode = null;
    /** Set Kimi-like coding mode for a conversation. */
    this.SetCodingMode = null;
    /** Get high-level planning phase for a conversation. */
    this.GetPlanModeState = null;
    /** Apply a semantic planning lifecycle transition. */
    this.TransitionPlanMode = null;
    /** List background subagent/shell tasks for a conversation. */
    this.ListBackgroundTasks = null;
    /** Cancel a background task by id. */
    this.CancelBackgroundTask = null;
    /** Install a skill from a GitHub URL into ~/.openfde/skills. */
    this.InstallSkillFromGithub = null;
    /** Search ClawHub skill registry. */
    this.SearchClawHubSkills = null;
    /** Inspect one ClawHub skill (latest version + moderation). */
    this.GetClawHubSkill = null;
    /** Preview a file from a ClawHub skill package. */
    this.PreviewClawHubSkillFile = null;
    /** Install a skill from ClawHub into ~/.openfde/skills. */
    this.InstallClawHubSkill = null;
    /** List skills installed from ClawHub. */
    this.ListClawHubInstalledSkills = null;
    /** Update one ClawHub-installed skill to latest version. */
    this.UpdateClawHubSkill = null;
    /** Update all ClawHub-installed skills (manual; no auto-update). */
    this.UpdateAllClawHubSkills = null;
    /** Uninstall a ClawHub-managed skill folder. */
    this.UninstallClawHubSkill = null;
    /** Start an editor LSP session for a workspace conversation. */
    this.EditorLspStartSession = null;
    /** Stop the editor LSP session and close owned documents. */
    this.EditorLspStopSession = null;
    /** Sync editor buffer to the language server (debounced in main). */
    this.EditorLspSyncDocument = null;
    /** Close a document in the editor LSP session. */
    this.EditorLspCloseDocument = null;
    /** Forward an LSP request for an open editor document. */
    this.EditorLspRequest = null;
    /** Format a workspace file with Prettier when available. */
    this.FormatWorkspaceFile = null;
    /** Lint a workspace file with ESLint when available. */
    this.LintWorkspaceFile = null;
    /** Native open-file dialog scoped to the conversation workspace/sandbox. */
    this.PickWorkspaceEditorFile = null;
    /** LSP workspace/symbol search for editor go-to-symbol (⌘T). */
    this.EditorLspWorkspaceSymbols = null;
  }
}
class IpcChannelRendererClass {
  constructor() {
    // ipcRenderer
    this.DownloadProgress = null;
    this.DownloadError = null;
    this.DownloadPaused = null;
    this.DownloadDone = null;
    this.updateMsg = null;
    this.UpdateProcessStatus = null;
    this.SendDataTest = null;
    this.BrowserViewTabDataUpdate = null;
    this.BrowserViewTabPositionXUpdate = null;
    this.BrowserTabMouseup = null;
    this.HotUpdateStatus = null;
    this.ConversationStoreChanged = null;
    this.PlanModeStateChanged = null;
    this.ChannelIncomingToAgent = null;
    this.WhatsAppIncomingToAgent = null;
    /**
     * Streaming chunk from the main-process agent engine
     */
    this.AgentStreamChunk = null;
    /** AI SDK UIMessageChunks from tool-loop streams (text-delta, tool-approval-request, …) */
    this.AgentUIMessageChunk = null;
    this.AgentStreamFinished = null;
    /**
     * Sandbox run ready — Results panel can load `resultsFileUrl` (directory listing).
     */
    this.AgentSandboxOutput = null;
    /** Streaming PTY output chunk for workspace terminal xterm view. */
    this.WorkspaceTerminalData = null;
    /** Session metadata after PTY spawn (cwd/shell). */
    this.WorkspaceTerminalStarted = null;
    /** PTY process exit notification. */
    this.WorkspaceTerminalExit = null;
    /** LSP notification pushed from main (diagnostics, etc.). */
    this.EditorLspNotification = null;
  }
}

function getIpcRenderer() {
  const IpcRenderer = {};
  Object.keys(new IpcChannelMainClass()).forEach((channel) => {
    IpcRenderer[channel] = {
      invoke: async (args) => electron.ipcRenderer.invoke(channel, args)
    };
  });
  Object.keys(new IpcChannelRendererClass()).forEach((channel) => {
    IpcRenderer[channel] = {
      on: (listener) => {
        electron.ipcRenderer.removeListener(channel, listener);
        electron.ipcRenderer.on(channel, listener);
      },
      once: (listener) => {
        electron.ipcRenderer.removeListener(channel, listener);
        electron.ipcRenderer.once(channel, listener);
      },
      removeListener: (listener) => {
        electron.ipcRenderer.removeListener(channel, listener);
      },
      removeAllListeners: () => electron.ipcRenderer.removeAllListeners(channel)
    };
  });
  return IpcRenderer;
}
electron.contextBridge.exposeInMainWorld("ipcRendererChannel", getIpcRenderer());
electron.contextBridge.exposeInMainWorld("systemInfo", {
  platform: os.platform(),
  release: os.release(),
  arch: os.arch()
});
electron.contextBridge.exposeInMainWorld("shell", electron.shell);
electron.contextBridge.exposeInMainWorld("crash", {
  start: () => {
    process.crash();
  }
});
//# sourceMappingURL=preload.js.map
