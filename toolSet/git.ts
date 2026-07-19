/**
 * Git tools for the agent — the single shared implementation used by every
 * skill. The coding/code-review skills reach these via `allowed_tools`; the
 * github skill also uses them (its former `actions/git.ts` was removed)
 * alongside its `gh` (`github_*`) tools, which share the same working-directory
 * resolution via {@link ./git-cwd}.
 *
 * Working directory is resolved from the active sandbox/workspace context (see
 * {@link resolveActiveGitCwd}): an explicit `workingDirectory` resolves against
 * the sandbox when active (github clones live there) else the workspace; with
 * no `workingDirectory` the workspace folder wins (coding/code-review), falling
 * back to the sandbox root (github default).
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  ghCreatePr as ghCreatePrService,
} from '@main/agent/workspace/git-service'
import {
  GIT_NOT_FOUND_MESSAGE,
  resolveGitBinary,
} from '@main/agent/workspace/git-binary'
import { getSandboxRootFromEnv } from './sandbox-paths'
import { resolveActiveGitCwd } from './git-cwd'
import { stampCommandToolResult } from '@shared/tool-result/terminal-capture'

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 120_000
const CLONE_TIMEOUT_MS = 600_000
const MAX_BUFFER = 1024 * 1024 * 50

const workingDirectoryField = z
  .string()
  .optional()
  .describe(
    'Path to the git repository root. Relative paths resolve against the active sandbox (github) or the workspace folder; absolute paths are allowed inside either. Defaults to the workspace folder when set, else the sandbox root.',
  )

export type GitCommandResult = {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  cwd: string
  command: string
  args: string[]
  error?: string
}

function formatGitCommand(args: string[]): string {
  return `git ${args.join(' ')}`
}

export async function runGitCommand(options: {
  args: string[]
  workingDirectory?: string
  timeoutMs?: number
  env?: Record<string, string>
}): Promise<GitCommandResult> {
  const { args, workingDirectory, timeoutMs, env } = options
  const cwdResolved = resolveActiveGitCwd(workingDirectory)
  if (cwdResolved.ok === false) {
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      cwd: '',
      command: formatGitCommand(args),
      args,
      error: cwdResolved.error,
    }
  }

  const cwd = cwdResolved.cwd
  const gitBin = resolveGitBinary()
  try {
    const { stdout, stderr } = await execFileAsync(gitBin, args, {
      cwd,
      timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      env: { ...process.env, ...env },
    })
    return stampCommandToolResult({
      success: true,
      exitCode: 0,
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? ''),
      cwd,
      command: formatGitCommand(args),
      args,
    })
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & {
      code?: number | string
      stdout?: string
      stderr?: string
      killed?: boolean
    }
    if (execErr.code === 'ENOENT') {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        cwd,
        command: formatGitCommand(args),
        args,
        error: GIT_NOT_FOUND_MESSAGE,
      }
    }
    const exitCode = typeof execErr.code === 'number' ? execErr.code : 1
    return stampCommandToolResult({
      success: exitCode === 0,
      exitCode,
      stdout: String(execErr.stdout ?? ''),
      stderr: String(execErr.stderr ?? ''),
      cwd,
      command: formatGitCommand(args),
      args,
      error: execErr.killed ? 'git command timed out' : undefined,
    })
  }
}

type GitApprovalFn<T> = (input: T) => boolean | Promise<boolean>

function defineGitTool<T extends z.ZodTypeAny>(config: {
  name: string
  description: string
  inputSchema: T
  needsApproval?: boolean | GitApprovalFn<z.infer<T>>
  timeoutMs?: number | ((input: z.infer<T>) => number | undefined)
  /** When set, used instead of `workingDirectory` on input (e.g. clone runs at sandbox root). */
  workingDirectory?: (input: z.infer<T>) => string | undefined
  buildArgs: (input: z.infer<T>) => string[]
}): SkillTool {
  const tool: SkillTool = {
    name: config.name,
    tags: ['git'],
    description: config.description,
    inputSchema: config.inputSchema,
    needsApproval: false,
    async execute(input) {
      const parsed = config.inputSchema.safeParse(input)
      if (!parsed.success) {
        return { success: false, error: parsed.error.flatten() }
      }

      let args: string[]
      try {
        args = config.buildArgs(parsed.data)
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }

      const timeoutMs =
        typeof config.timeoutMs === 'function'
          ? config.timeoutMs(parsed.data)
          : config.timeoutMs

      const data = parsed.data as { workingDirectory?: string }
      const workingDirectory = config.workingDirectory
        ? config.workingDirectory(parsed.data)
        : data.workingDirectory

      return runGitCommand({ args, workingDirectory, timeoutMs })
    },
  }

  if (typeof config.needsApproval === 'function') {
    ;(tool as SkillTool & { needsApproval: GitApprovalFn<z.infer<T>> }).needsApproval =
      config.needsApproval as never
  } else {
    tool.needsApproval = config.needsApproval ?? false
  }

  return tool
}

const cwdOnly = z.object({ workingDirectory: workingDirectoryField })

export const gitStatus = defineGitTool({
  name: 'git_status',
  description:
    'Show working tree status (porcelain v2 with branch info). Read-only.',
  inputSchema: cwdOnly.extend({
    includeUntracked: z.boolean().optional().default(true),
  }),
  buildArgs: (input) => {
    const args = ['status', '--porcelain=v2', '-b']
    if (!input.includeUntracked) args.push('-uno')
    return args
  },
})

export const gitDiff = defineGitTool({
  name: 'git_diff',
  description:
    'Show changes. Use staged=true for index vs HEAD, paths to limit files. Read-only.',
  inputSchema: cwdOnly.extend({
    staged: z.boolean().optional().default(false),
    stat: z.boolean().optional().default(false),
    paths: z.array(z.string().min(1)).optional().default([]),
  }),
  buildArgs: (input) => {
    const args = ['diff']
    if (input.staged) args.push('--cached')
    if (input.stat) args.push('--stat')
    if (input.paths.length) args.push('--', ...input.paths)
    return args
  },
})

export const gitLog = defineGitTool({
  name: 'git_log',
  description:
    'Show commit history. Read-only. Supports oneline format and optional path limits.',
  inputSchema: cwdOnly.extend({
    maxCount: z.number().int().min(1).max(500).optional().default(30),
    oneline: z.boolean().optional().default(true),
    ref: z.string().optional().describe('Start at this ref (e.g. branch, HEAD~3).'),
    paths: z.array(z.string().min(1)).optional().default([]),
  }),
  buildArgs: (input) => {
    const args = ['log', `-n`, String(input.maxCount)]
    if (input.oneline) args.push('--oneline', '--decorate')
    if (input.ref?.trim()) args.push(input.ref.trim())
    if (input.paths.length) args.push('--', ...input.paths)
    return args
  },
})

export const gitShow = defineGitTool({
  name: 'git_show',
  description: 'Show a commit or object (patch included). Read-only.',
  inputSchema: cwdOnly.extend({
    ref: z.string().optional().default('HEAD').describe('Commit, tag, or object to show.'),
    stat: z.boolean().optional().default(false),
  }),
  buildArgs: (input) => {
    const args = ['show', (input.ref ?? 'HEAD').trim()]
    if (input.stat) args.push('--stat')
    return args
  },
})

export const gitAdd = defineGitTool({
  name: 'git_add',
  description:
    'Stage paths for commit. Use all=true to stage everything, or paths such as ["."] for specific files.',
  inputSchema: cwdOnly.extend({
    paths: z.array(z.string().min(1)).optional().default([]),
    all: z.boolean().optional().default(false),
    update: z.boolean().optional().default(false),
  }),
  buildArgs: (input) => {
    const args = ['add']
    if (input.all) args.push('-A')
    else if (input.update) args.push('-u')
    if (input.paths.length) args.push('--', ...input.paths)
    else if (!input.all && !input.update) {
      throw new Error('Provide paths, or set all=true / update=true')
    }
    return args
  },
})

export const gitReset = defineGitTool({
  name: 'git_reset',
  description:
    'Unstage or reset HEAD. mode soft|mixed|hard (hard rewrites tree — requires approval).',
  inputSchema: cwdOnly.extend({
    mode: z.enum(['soft', 'mixed', 'hard']).optional(),
    ref: z.string().optional().describe('Commit to reset to (default HEAD).'),
    paths: z.array(z.string().min(1)).optional().default([]),
  }),
  needsApproval: (input) => input.mode === 'hard',
  buildArgs: (input) => {
    const args = ['reset']
    if (input.mode) args.push(`--${input.mode}`)
    if (input.ref?.trim()) args.push(input.ref.trim())
    if (input.paths.length) args.push('--', ...input.paths)
    return args
  },
})

export const gitCommit = defineGitTool({
  name: 'git_commit',
  description: 'Create a commit with the given message. Requires approval.',
  inputSchema: cwdOnly.extend({
    message: z.string().min(1),
    amend: z.boolean().optional().default(false),
    allowEmpty: z.boolean().optional().default(false),
    all: z.boolean().optional().default(false).describe('Stage all tracked changes (-a).'),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    const args = ['commit', '-m', input.message]
    if (input.amend) args.push('--amend')
    if (input.allowEmpty) args.push('--allow-empty')
    if (input.all) args.push('-a')
    return args
  },
})

export const gitBranch = defineGitTool({
  name: 'git_branch',
  description:
    'List, create, delete, or rename branches. delete is destructive and requires approval.',
  inputSchema: cwdOnly.extend({
    action: z.enum(['list', 'create', 'delete', 'rename', 'show-current']),
    name: z.string().optional(),
    newName: z.string().optional(),
    force: z.boolean().optional().default(false),
    remote: z.boolean().optional().default(false).describe('Include remote-tracking branches when listing.'),
  }),
  needsApproval: (input) => input.action === 'delete',
  buildArgs: (input) => {
    switch (input.action) {
      case 'list': {
        const args = ['branch']
        if (input.remote) args.push('-a')
        return args
      }
      case 'create': {
        if (!input.name?.trim()) throw new Error('name is required for create')
        const args = ['branch', input.name.trim()]
        if (input.force) args.push('-f')
        return args
      }
      case 'delete': {
        if (!input.name?.trim()) throw new Error('name is required for delete')
        const args = ['branch', input.force ? '-D' : '-d', input.name.trim()]
        return args
      }
      case 'rename': {
        if (!input.name?.trim() || !input.newName?.trim()) {
          throw new Error('name and newName are required for rename')
        }
        return ['branch', '-m', input.name.trim(), input.newName.trim()]
      }
      case 'show-current':
        return ['branch', '--show-current']
      default:
        return ['branch']
    }
  },
})

export const gitCheckout = defineGitTool({
  name: 'git_checkout',
  description:
    'Switch branches or restore paths. Branch checkout may require approval when creating a new branch.',
  inputSchema: cwdOnly.extend({
    branch: z.string().optional(),
    create: z.boolean().optional().default(false),
    paths: z.array(z.string().min(1)).optional().default([]),
  }),
  needsApproval: false,
  buildArgs: (input) => {
    const args = ['checkout']
    if (input.create && input.branch?.trim()) args.push('-b', input.branch.trim())
    else if (input.branch?.trim()) args.push(input.branch.trim())
    if (input.paths.length) args.push('--', ...input.paths)
    return args
  },
})

export const gitMerge = defineGitTool({
  name: 'git_merge',
  description: 'Merge a branch into the current branch. Requires approval.',
  inputSchema: cwdOnly.extend({
    branch: z.string().min(1),
    noFf: z.boolean().optional().default(false),
    message: z.string().optional(),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    const args = ['merge']
    if (input.noFf) args.push('--no-ff')
    if (input.message?.trim()) args.push('-m', input.message.trim())
    args.push(input.branch.trim())
    return args
  },
})

export const gitRebase = defineGitTool({
  name: 'git_rebase',
  description: 'Rebase current branch onto another ref. Requires approval.',
  inputSchema: cwdOnly.extend({
    onto: z.string().min(1),
    abort: z.boolean().optional().default(false),
    continue: z.boolean().optional().default(false),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    if (input.abort) return ['rebase', '--abort']
    if (input.continue) return ['rebase', '--continue']
    return ['rebase', input.onto.trim()]
  },
})

export const gitCherryPick = defineGitTool({
  name: 'git_cherry_pick',
  description: 'Apply an existing commit on the current branch. Requires approval.',
  inputSchema: cwdOnly.extend({
    commit: z.string().min(1),
    noCommit: z.boolean().optional().default(false),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    const args = ['cherry-pick']
    if (input.noCommit) args.push('-n')
    args.push(input.commit.trim())
    return args
  },
})

export const gitRevert = defineGitTool({
  name: 'git_revert',
  description: 'Create a new commit that undoes a prior commit. Requires approval.',
  inputSchema: cwdOnly.extend({
    commit: z.string().min(1),
    noCommit: z.boolean().optional().default(false),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    const args = ['revert']
    if (input.noCommit) args.push('-n')
    args.push(input.commit.trim())
    return args
  },
})

export const gitStash = defineGitTool({
  name: 'git_stash',
  description: 'Stash working tree changes: list, push, pop, apply, drop, or show.',
  inputSchema: cwdOnly.extend({
    action: z.enum(['list', 'push', 'pop', 'apply', 'drop', 'show']),
    message: z.string().optional(),
    index: z.number().int().min(0).optional(),
  }),
  needsApproval: false,
  buildArgs: (input) => {
    const ref = input.index != null ? `stash@{${input.index}}` : undefined
    switch (input.action) {
      case 'list':
        return ['stash', 'list']
      case 'push': {
        const args = ['stash', 'push']
        if (input.message?.trim()) args.push('-m', input.message.trim())
        return args
      }
      case 'pop':
        return ref ? ['stash', 'pop', ref] : ['stash', 'pop']
      case 'apply':
        return ref ? ['stash', 'apply', ref] : ['stash', 'apply']
      case 'drop':
        return ref ? ['stash', 'drop', ref] : ['stash', 'drop']
      case 'show':
        return ref ? ['stash', 'show', '-p', ref] : ['stash', 'show', '-p']
      default:
        return ['stash', 'list']
    }
  },
})

export const gitPull = defineGitTool({
  name: 'git_pull',
  description: 'Fetch and integrate from a remote. Requires approval.',
  inputSchema: cwdOnly.extend({
    remote: z.string().optional().default('origin'),
    branch: z.string().optional(),
    rebase: z.boolean().optional().default(false),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    const args = ['pull']
    if (input.rebase) args.push('--rebase')
    if (input.remote?.trim()) args.push(input.remote.trim())
    if (input.branch?.trim()) args.push(input.branch.trim())
    return args
  },
})

export const gitPush = defineGitTool({
  name: 'git_push',
  description:
    'Push commits to a remote. force=true requires approval and uses --force-with-lease when possible.',
  inputSchema: cwdOnly.extend({
    remote: z.string().optional().default('origin'),
    branch: z.string().optional(),
    force: z.boolean().optional().default(false),
    setUpstream: z.boolean().optional().default(false),
  }),
  needsApproval: true,
  buildArgs: (input) => {
    const args = ['push']
    if (input.force) args.push('--force-with-lease')
    if (input.setUpstream) args.push('-u')
    if (input.remote?.trim()) args.push(input.remote.trim())
    if (input.branch?.trim()) args.push(input.branch.trim())
    return args
  },
})

export const gitFetch = defineGitTool({
  name: 'git_fetch',
  description: 'Download objects from a remote without merging. Read-only for local branches.',
  inputSchema: cwdOnly.extend({
    remote: z.string().optional(),
    prune: z.boolean().optional().default(false),
    all: z.boolean().optional().default(false),
  }),
  buildArgs: (input) => {
    const args = ['fetch']
    if (input.all) args.push('--all')
    if (input.prune) args.push('--prune')
    if (input.remote?.trim()) args.push(input.remote.trim())
    return args
  },
})

export const gitClone = defineGitTool({
  name: 'git_clone',
  description:
    'Clone a repository into the sandbox (or a subdirectory). Requires approval. Network access needed.',
  inputSchema: z.object({
    url: z.string().url(),
    directory: z
      .string()
      .optional()
      .describe('Sandbox-relative destination directory (default: repo name from URL).'),
    branch: z.string().optional(),
    depth: z.number().int().min(1).optional(),
  }),
  needsApproval: true,
  timeoutMs: () => CLONE_TIMEOUT_MS,
  workingDirectory: () => getSandboxRootFromEnv(),
  buildArgs: (input) => {
    const args = ['clone']
    if (input.branch?.trim()) args.push('--branch', input.branch.trim())
    if (input.depth != null) args.push('--depth', String(input.depth))
    args.push(input.url.trim())
    if (input.directory?.trim()) args.push(input.directory.trim())
    return args
  },
})

export const gitRemote = defineGitTool({
  name: 'git_remote',
  description: 'List or manage remotes (add, remove, rename, get-url, set-url).',
  inputSchema: cwdOnly.extend({
    action: z.enum(['list', 'add', 'remove', 'rename', 'get-url', 'set-url']),
    name: z.string().optional(),
    url: z.string().optional(),
    newName: z.string().optional(),
  }),
  buildArgs: (input) => {
    switch (input.action) {
      case 'list':
        return ['remote', '-v']
      case 'add': {
        if (!input.name?.trim() || !input.url?.trim()) {
          throw new Error('name and url are required for add')
        }
        return ['remote', 'add', input.name.trim(), input.url.trim()]
      }
      case 'remove': {
        if (!input.name?.trim()) throw new Error('name is required for remove')
        return ['remote', 'remove', input.name.trim()]
      }
      case 'rename': {
        if (!input.name?.trim() || !input.newName?.trim()) {
          throw new Error('name and newName are required for rename')
        }
        return ['remote', 'rename', input.name.trim(), input.newName.trim()]
      }
      case 'get-url': {
        if (!input.name?.trim()) throw new Error('name is required for get-url')
        return ['remote', 'get-url', input.name.trim()]
      }
      case 'set-url': {
        if (!input.name?.trim() || !input.url?.trim()) {
          throw new Error('name and url are required for set-url')
        }
        return ['remote', 'set-url', input.name.trim(), input.url.trim()]
      }
      default:
        return ['remote', '-v']
    }
  },
})

export const gitTag = defineGitTool({
  name: 'git_tag',
  description: 'List, create, or delete tags. delete requires approval.',
  inputSchema: cwdOnly.extend({
    action: z.enum(['list', 'create', 'delete']),
    name: z.string().optional(),
    message: z.string().optional().describe('Annotated tag message.'),
    commit: z.string().optional(),
    force: z.boolean().optional().default(false),
  }),
  needsApproval: (input) => input.action === 'delete',
  buildArgs: (input) => {
    switch (input.action) {
      case 'list':
        return ['tag', '-l']
      case 'create': {
        if (!input.name?.trim()) throw new Error('name is required for create')
        const args = ['tag']
        if (input.message?.trim()) {
          args.push('-a', input.name.trim(), '-m', input.message.trim())
        } else {
          args.push(input.name.trim())
        }
        if (input.force) args.push('-f')
        if (input.commit?.trim()) args.push(input.commit.trim())
        return args
      }
      case 'delete': {
        if (!input.name?.trim()) throw new Error('name is required for delete')
        return ['tag', '-d', input.name.trim()]
      }
      default:
        return ['tag', '-l']
    }
  },
})

export const gitClean = defineGitTool({
  name: 'git_clean',
  description:
    'Remove untracked files. dryRun defaults true; force=true deletes files and requires approval.',
  inputSchema: cwdOnly.extend({
    dryRun: z.boolean().optional().default(true),
    force: z.boolean().optional().default(false),
    directories: z.boolean().optional().default(false),
  }),
  needsApproval: (input) => input.force === true && input.dryRun !== true,
  buildArgs: (input) => {
    const args = ['clean']
    if (input.dryRun) args.push('-n')
    if (input.force) args.push('-f')
    if (input.directories) args.push('-d')
    return args
  },
})

export const gitInit = defineGitTool({
  name: 'git_init',
  description: 'Initialize a new git repository at the working directory.',
  inputSchema: cwdOnly.extend({
    bare: z.boolean().optional().default(false),
  }),
  buildArgs: (input) => {
    const args = ['init']
    if (input.bare) args.push('--bare')
    return args
  },
})

export const gitConfig = defineGitTool({
  name: 'git_config',
  description: 'Read or write local repository config (list, get, set, unset).',
  inputSchema: cwdOnly.extend({
    action: z.enum(['list', 'get', 'set', 'unset']),
    key: z.string().optional(),
    value: z.string().optional(),
    global: z.boolean().optional().default(false),
  }),
  buildArgs: (input) => {
    const scope = input.global ? ['--global'] : ['--local']
    switch (input.action) {
      case 'list':
        return [...scope, 'config', '--list']
      case 'get': {
        if (!input.key?.trim()) throw new Error('key is required for get')
        return [...scope, 'config', input.key.trim()]
      }
      case 'set': {
        if (!input.key?.trim() || input.value == null) {
          throw new Error('key and value are required for set')
        }
        return [...scope, 'config', input.key.trim(), input.value]
      }
      case 'unset': {
        if (!input.key?.trim()) throw new Error('key is required for unset')
        return [...scope, 'config', '--unset', input.key.trim()]
      }
      default:
        return ['config', '--list']
    }
  },
})

const gitCreatePrSchema = z.object({
  workingDirectory: workingDirectoryField,
  title: z.string().min(1).describe('PR title (short, under 70 chars).'),
  body: z.string().describe('PR description in markdown. Include a summary and test plan.'),
  base: z
    .string()
    .optional()
    .describe('Base branch (defaults to the repo default branch, usually main/master).'),
  draft: z.boolean().optional().default(false).describe('Open as a draft PR.'),
})

export const gitCreatePr: SkillTool = {
  name: 'git_create_pr',
  tags: ['git'],
  description:
    'Create a GitHub pull request using the `gh` CLI. Requires `gh` to be installed and authenticated (`gh auth status`). ' +
    'Push the branch first with `git_push`. Returns the PR URL on success.',
  inputSchema: gitCreatePrSchema,
  needsApproval: true,
  async execute(input) {
    const parsed = gitCreatePrSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.flatten() }

    const resolved = resolveActiveGitCwd(parsed.data.workingDirectory)
    if (!resolved.ok) return { ok: false, error: resolved.error }

    const result = await ghCreatePrService(resolved.cwd, {
      title: parsed.data.title,
      body: parsed.data.body,
      base: parsed.data.base,
      draft: parsed.data.draft,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, url: result.url, output: result.url }
  },
}

export const gitTools: SkillTool[] = [
  gitStatus,
  gitDiff,
  gitLog,
  gitShow,
  gitAdd,
  gitReset,
  gitCommit,
  gitBranch,
  gitCheckout,
  gitMerge,
  gitRebase,
  gitCherryPick,
  gitRevert,
  gitStash,
  gitPull,
  gitPush,
  gitFetch,
  gitClone,
  gitRemote,
  gitTag,
  gitClean,
  gitInit,
  gitConfig,
  gitCreatePr,
]
