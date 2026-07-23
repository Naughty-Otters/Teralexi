import {
  CURSOR_BUILTIN_SUBAGENT_PROFILES,
  isCursorBuiltinSubagentProfile,
  parseSubagentProfileType,
  type SubagentProfileType,
} from '@shared/agent/coding-mode'

/** How MCP tools are exposed to a profiled child. */
export type SubagentMcpAccess = 'none' | 'browser' | 'all'

export type SubagentProfile = {
  type: SubagentProfileType
  label: string
  description: string
  /** Catalog agent id to invoke (coding skill by default). */
  agentId: string
  allowedTools: string[] | 'all'
  /** Prepended to the user task (Cursor-style role framing). */
  taskPrefix: string
  /**
   * Appended to the child system prompt — specialized behavior like Cursor's
   * built-in Explore / Bash / Browser agents.
   */
  systemInstructions: string
  /** Omit full parent thread; seed with task + ledger only. */
  slimContext: boolean
  /** Never create an isolated worktree (read-only / plan / bash / browser). */
  isolateGitWorktree: boolean
  /** MCP tool exposure for this profile. */
  mcpAccess: SubagentMcpAccess
  /**
   * When true, parent should prefer this profile over doing the same work
   * inline (Cursor built-in priority).
   */
  priorityBuiltin: boolean
}

/**
 * Cursor-aligned profiles:
 * - explore / bash / browser ≈ Cursor built-ins (priority for noisy work)
 * - architect ≈ custom planner
 * - coder ≈ implementer
 */
const EXPLORE_TOOLS = [
  'read_file',
  'lsp',
  'shell',
]

const ARCHITECT_TOOLS = [...EXPLORE_TOOLS, 'read_todos', 'update_todos']

const BASH_TOOLS = [
  'shell',
  'read_file',
  'edit_files',
  'run_script',
  'run_script_file',
]

const BROWSER_TOOLS = [
  'web_search',
  'web_scrape',
  'read_file',
  'edit_files',
]

const EXPLORE_SYSTEM = `You are an Explore sub-agent (Cursor built-in). You run in an isolated context so noisy search output does not bloat the parent conversation.

Rules:
- Read-only for the codebase: use read_file, lsp, and read-only shell (rg/find/git status|diff|log|show). Never edit_files or mutating shell.
- There is **no** \`bash\` or \`run_script\` tool — commands go through \`shell\` only.
- Prefer lsp over blanket directory walks; use rg/find via shell when needed.
- Do not re-read paths already listed in the session read ledger unless the file changed or you need a new offset.
- **Fan out:** for mapping questions, issue multiple independent tool calls in the same turn (parallel reads + rg/find). Avoid a single huge dump command; prefer several focused searches/reads.
- Return a concise structured brief for the parent — not a full tool transcript:
  - What you searched
  - Key files/symbols (path + why)
  - Findings relevant to the task
  - Open questions / next steps for a coder
- Keep intermediate search noise out of the final answer; the parent only needs the summary.`

const BASH_SYSTEM = `You are a Bash sub-agent (Cursor built-in profile name: \`bash\`). You isolate verbose command/script output so the parent stays focused on decisions.

Rules:
- Prefer \`shell\` with argv arrays for project commands (tests, builds, linters, rg/find, git).
- Use \`run_script\` / \`run_script_file\` for sandbox scripts when that fits better than a one-off shell argv.
- There is **no** tool named \`bash\` — the profile id is \`bash\`; commands go through \`shell\` / run_script tools.
- Prefer git via shell (status/diff) over inventing structured git tools.
- **Source edits:** use \`edit_files\` for project file changes so the chat shows diffs. Do not rewrite source via shell redirects, \`sed -i\`, \`tee\`, or heredocs.
- \`edit_files\` is also fine for small config/script fixes needed to unblock commands; prefer reporting larger design changes for the Coder/parent.
- Run a focused series of commands; do not explore the whole codebase (hand off to Explore if needed).
- Capture failures with enough stdout/stderr to diagnose; then summarize for the parent:
  - Commands/scripts run (and cwd if relevant)
  - Exit status
  - Key output lines / failure cause
  - Files changed (if any) and suggested next step`

const BROWSER_SYSTEM = `You are a Browser sub-agent (Cursor built-in). You isolate noisy DOM snapshots, screenshots, and page scrapes.

Rules:
- Use web_search / web_scrape and any browser MCP tools available to you.
- Prefer targeted navigation and extraction over dumping full pages.
- Filter intermediate noise; return only what the parent needs:
  - What you opened / searched
  - Relevant extracted facts or UI state
  - Links / selectors / evidence worth acting on
  - Blockers (auth walls, missing MCP, timeouts)
- Do not implement codebase changes; report findings for the parent/Coder. Optional notes via edit_files mode write only if explicitly needed.`

const ARCHITECT_SYSTEM = `You are a Plan/Architect sub-agent (Cursor-style planner). Analyze and plan — do not implement.

Rules:
- Read-only for the codebase (no edit_files). Use read_file, lsp, and read-only shell.
- You may update_todos with an actionable plan when that helps the parent.
- Prefer the explore manifest and session read ledger before re-exploring.
- Break the task into a clear, ordered implementation plan the Coder can execute:
  - Goal
  - Steps (ordered, concrete file/symbol targets)
  - Risks / edge cases
  - Verification (tests/commands)
- Do not claim work is done; you only produce the plan.`

const CODER_SYSTEM = `You are a Coder sub-agent (implementer). Implement and verify the delegated task.

Rules:
- Trust the parent brief, explore/bash/browser findings, and session read ledger — do not re-map the whole repo first.
- Edit with edit_files (replace/write/delete/patch); verify with shell when appropriate.
- Prefer lsp + targeted reads; use shell rg/find only when needed.
- When finished, summarize what changed, how you verified, and any follow-ups.
- File changes are auto-merged into the parent workspace; focus on correct edits, not merge/PR UI.`

export const SUBAGENT_PROFILES: Record<SubagentProfileType, SubagentProfile> = {
  explore: {
    type: 'explore',
    label: 'Explore',
    description:
      'Priority: read-only codebase exploration. Use for find/where/how and mapping before edits (Cursor Explore).',
    agentId: 'skill:coding',
    allowedTools: EXPLORE_TOOLS,
    taskPrefix: '[Explore] ',
    systemInstructions: EXPLORE_SYSTEM,
    slimContext: true,
    isolateGitWorktree: false,
    mcpAccess: 'none',
    priorityBuiltin: true,
  },
  bash: {
    type: 'bash',
    label: 'Bash',
    description:
      'Priority: run commands/scripts (`shell`, `run_script`, `run_script_file`) and small `edit_files` fixes (profile id `bash`).',
    agentId: 'skill:coding',
    allowedTools: BASH_TOOLS,
    taskPrefix: '[Bash] ',
    systemInstructions: BASH_SYSTEM,
    slimContext: true,
    isolateGitWorktree: false,
    mcpAccess: 'none',
    priorityBuiltin: true,
  },
  browser: {
    type: 'browser',
    label: 'Browser',
    description:
      'Priority: web/browser automation and page extraction; filters DOM noise (Cursor Browser).',
    agentId: 'skill:coding',
    allowedTools: BROWSER_TOOLS,
    taskPrefix: '[Browser] ',
    systemInstructions: BROWSER_SYSTEM,
    slimContext: true,
    isolateGitWorktree: false,
    mcpAccess: 'browser',
    priorityBuiltin: true,
  },
  architect: {
    type: 'architect',
    label: 'Plan',
    description:
      'Read-only analysis that produces an implementation plan. Use before large multi-file changes.',
    agentId: 'skill:coding',
    allowedTools: ARCHITECT_TOOLS,
    taskPrefix: '[Plan] ',
    systemInstructions: ARCHITECT_SYSTEM,
    slimContext: true,
    isolateGitWorktree: false,
    mcpAccess: 'none',
    priorityBuiltin: false,
  },
  coder: {
    type: 'coder',
    label: 'Coder',
    description:
      'Implement and verify code changes. Use after explore/plan, or for focused edits.',
    agentId: 'skill:coding',
    allowedTools: 'all',
    taskPrefix: '[Coder] ',
    systemInstructions: CODER_SYSTEM,
    slimContext: false,
    isolateGitWorktree: true,
    mcpAccess: 'all',
    priorityBuiltin: false,
  },
}

export function resolveSubagentProfile(
  type: string,
): SubagentProfile | null {
  const key = parseSubagentProfileType(type)
  if (!key) return null
  return SUBAGENT_PROFILES[key] ?? null
}

/** Apply a profile onto spawn params (tools, task framing, isolation, instructions). */
export function applySubagentProfileToTask(
  profile: SubagentProfile,
  task: string,
): {
  task: string
  allowedToolNames: string[] | 'all'
  isolateGitWorktree: boolean
  systemPromptAddendum: string
  slimContext: boolean
  mcpAccess: SubagentMcpAccess
  profile: SubagentProfileType
} {
  const trimmed = task.trim()
  const prefixed = trimmed.startsWith(profile.taskPrefix)
    ? trimmed
    : `${profile.taskPrefix}${trimmed}`
  return {
    task: prefixed,
    allowedToolNames: profile.allowedTools,
    isolateGitWorktree: profile.isolateGitWorktree,
    systemPromptAddendum: profile.systemInstructions,
    slimContext: profile.slimContext,
    mcpAccess: profile.mcpAccess,
    profile: profile.type,
  }
}

/** True when a tool name/server looks like browser automation (Cursor Browser MCP). */
export function isBrowserMcpToolName(
  name: string,
  serverId?: string,
): boolean {
  const hay = `${name} ${serverId ?? ''}`.toLowerCase()
  return /browser|playwright|puppeteer|chromium|devtools|navigate|screenshot|snapshot|click|fill|hover|tab_/.test(
    hay,
  )
}

export function filterMcpToolsForSubagentAccess<
  T extends { name: string; serverId?: string },
>(tools: T[], access: SubagentMcpAccess | undefined): T[] {
  if (!access || access === 'all') return tools
  if (access === 'none') return []
  return tools.filter((t) => isBrowserMcpToolName(t.name, t.serverId))
}

/** Routing copy: prefer Cursor built-ins before parent does the noisy work inline. */
export function formatBuiltinSubagentPriorityInstructions(): string {
  const lines = [
    '**Priority built-in sub-agents (Cursor-style — prefer these before doing the same work in the parent):**',
  ]
  for (const type of CURSOR_BUILTIN_SUBAGENT_PROFILES) {
    const p = SUBAGENT_PROFILES[type]
    lines.push(`- \`${type}\` — ${p.description}`)
  }
  lines.push(
    '- When the task is noisy search, a long command series, or browser/DOM work: call `invoke_agents` with that `profile` and consume the brief — do not re-run the same loop in the parent.',
    '- Profile `bash` uses `shell`, `run_script`, `run_script_file`, and `edit_files` — there is no tool named `bash`.',
    '- Orchestration after built-ins: `architect`/`plan` (plan only) → `coder` (implement).',
  )
  return lines.join('\n')
}

export { isCursorBuiltinSubagentProfile, CURSOR_BUILTIN_SUBAGENT_PROFILES }
