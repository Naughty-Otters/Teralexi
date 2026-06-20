import { execFile, spawn, type ExecException } from 'child_process'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { getWorkspacePathFromEnv } from '../sandbox-paths'
import { formatCommandOutput } from '@shared/tool-result/terminal-capture'
import { FILE_SYSTEM_TAG } from './constants'
import {
  createBackgroundTask,
  registerShellTask,
  completeBackgroundTask,
} from '@main/agent/background/background-task-manager'

function requireWorkspace(): { ok: true; path: string } | { ok: false; error: string } {
  const p = getWorkspacePathFromEnv()
  if (!p) {
    return {
      ok: false,
      error:
        'No workspace folder is set for this conversation. ' +
        'Ask the user to select a workspace folder before running project commands.',
    }
  }
  return { ok: true, path: p }
}

/** Tokenize a command string (no shell); respects single- and double-quoted segments. */
export function parseCommandArgv(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current) tokens.push(current)
  return tokens
}

function normalizeArgv(input: unknown): { ok: true; argv: string[] } | { ok: false; error: string } {
  if (Array.isArray(input)) {
    const argv = input.filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (argv.length === 0) {
      return { ok: false, error: 'command must be a non-empty argv array.' }
    }
    return { ok: true, argv }
  }
  if (typeof input === 'string' && input.trim()) {
    const argv = parseCommandArgv(input.trim())
    if (argv.length === 0) {
      return { ok: false, error: 'command must contain at least one token.' }
    }
    return { ok: true, argv }
  }
  return { ok: false, error: 'command must be a string or argv array.' }
}

async function runExecFile(options: {
  executable: string
  args: string[]
  cwd: string
  timeoutMs: number
  env: NodeJS.ProcessEnv
}) {
  const { executable, args, cwd, timeoutMs, env } = options
  return new Promise<{
    stdout: string
    stderr: string
    exitCode: number
    signal: NodeJS.Signals | null
    timedOut: boolean
    error?: string
  }>((resolve) => {
    execFile(
      executable,
      args,
      {
        cwd,
        env,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            exitCode: 0,
            signal: null,
            timedOut: false,
          })
          return
        }

        const execError = error as ExecException & {
          code?: number | string
          killed?: boolean
          signal?: NodeJS.Signals | null
        }
        const timedOut =
          execError.killed === true && execError.signal === 'SIGTERM'
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          exitCode: typeof execError.code === 'number' ? execError.code : 1,
          signal: execError.signal ?? null,
          timedOut,
          error: String(execError),
        })
      },
    )
  })
}

/** Resolve the shell executable + args for a shell-mode command. */
function resolveShellInvocation(commandStr: string): {
  executable: string
  args: string[]
} {
  if (process.platform === 'win32') {
    return {
      executable: process.env.ComSpec?.trim() || 'cmd.exe',
      args: ['/d', '/s', '/c', commandStr],
    }
  }
  return {
    executable: process.env.SHELL?.trim() || '/bin/bash',
    args: ['-c', commandStr],
  }
}

export const runWorkspaceCommand: SkillTool = {
  name: 'run_workspace_command',
  tags: [...FILE_SYSTEM_TAG, 'workspace'],
  description:
    'Run a command in the user project folder. Requires a selected workspace; do not use for sandbox paths (output/, scripts/). ' +
    'Default: argv via execFile, no shell (e.g. ["npm","test"] or a quoted string). ' +
    'Set `shell: true` to run a full shell command string with pipes, &&, redirects, and globs (e.g. "npm run build && npm test 2>&1 | tail -50") — runs through the OS shell in the workspace. ' +
    'Optional cwd is relative to the workspace root. Requires approval.',
  inputSchema: z.object({
    command: z.union([z.array(z.string().min(1)), z.string().min(1)]),
    shell: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Run `command` through the OS shell (supports pipes, &&, redirects, globs). `command` must be a string in shell mode.',
      ),
    cwd: z.string().optional(),
    timeoutMs: z
      .number()
      .int()
      .min(100)
      .max(600_000)
      .optional()
      .default(120_000),
    background: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Run in background; returns taskId immediately while stdout/stderr stream to the task panel.',
      ),
  }),
  needsApproval: true,
  async execute(input) {
    const ws = requireWorkspace()
    if (!ws.ok) return { error: ws.error }

    const useShell = input['shell'] === true
    const timeoutMs =
      typeof input['timeoutMs'] === 'number' && input['timeoutMs'] > 0
        ? input['timeoutMs']
        : 120_000

    const rawCwd = input['cwd']
    let cwd = ws.path
    if (typeof rawCwd === 'string' && rawCwd.trim()) {
      const resolved = path.resolve(ws.path, rawCwd.trim())
      const rel = path.relative(ws.path, resolved)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { error: 'cwd must stay inside the workspace root.' }
      }
      cwd = resolved
    }

    let executable: string
    let args: string[]
    let displayCommand: string | string[]

    if (useShell) {
      const commandStr = Array.isArray(input['command'])
        ? input['command'].join(' ')
        : String(input['command'] ?? '').trim()
      if (!commandStr) {
        return { error: 'command must be a non-empty string in shell mode.' }
      }
      const shell = resolveShellInvocation(commandStr)
      executable = shell.executable
      args = shell.args
      displayCommand = commandStr
    } else {
      const parsed = normalizeArgv(input['command'])
      if (!parsed.ok) return { error: parsed.error }
      ;[executable, ...args] = parsed.argv
      displayCommand = parsed.argv
    }

    if (input['background'] === true) {
      const label =
        typeof displayCommand === 'string'
          ? displayCommand.slice(0, 120)
          : displayCommand.join(' ').slice(0, 120)
      const bg = createBackgroundTask({
        kind: 'shell',
        label,
      })
      const child = spawn(executable, args, {
        cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
      })
      registerShellTask(bg, child)
      child.on('close', (code, signal) => {
        completeBackgroundTask(
          bg.id,
          code === 0 ? 'completed' : 'failed',
          code !== 0 ? `exit ${code ?? signal ?? 'unknown'}` : undefined,
        )
      })
      child.on('error', (err) => {
        completeBackgroundTask(bg.id, 'failed', err.message)
      })
      return {
        background: true,
        taskId: bg.id,
        workspacePath: ws.path,
        cwd,
        command: displayCommand,
        shell: useShell,
        message: `Command started in background (${bg.id})`,
      }
    }

    const result = await runExecFile({
      executable,
      args,
      cwd,
      timeoutMs,
      env: process.env,
    })

    const output = formatCommandOutput(result.stdout, result.stderr)
    return {
      workspacePath: ws.path,
      cwd,
      command: displayCommand,
      shell: useShell,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      output,
      resultContent: output,
      ...(result.error ? { error: result.error } : {}),
    }
  },
}
