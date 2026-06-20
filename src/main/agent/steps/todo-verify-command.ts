import { execFile } from 'node:child_process'
import { formatCommandOutput } from '@shared/tool-result/terminal-capture'
import { createLogger } from '@main/logger'
import type { AgentStepContext } from '../context'
import { getWorkspacePath } from '../workspace/conversation-workspace'

const log = createLogger('agent.steps.todo-verify')

const VERIFY_COMMAND_TIMEOUT_MS = 60_000

export type TodoVerifyCommandResult =
  | { ok: true; output: string }
  | { ok: false; output: string; error: string }

function resolveShellInvocation(command: string): {
  executable: string
  args: string[]
} {
  if (process.platform === 'win32') {
    return {
      executable: process.env.ComSpec?.trim() || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
    }
  }
  return {
    executable: process.env.SHELL?.trim() || '/bin/bash',
    args: ['-c', command],
  }
}

/** Run a plan todo verify_command in the user workspace, or sandbox root when no workspace is set. */
export async function runTodoVerifyCommand(
  ctx: AgentStepContext,
  verifyCommand: string,
): Promise<TodoVerifyCommandResult> {
  const command = verifyCommand.trim()
  if (!command) {
    return { ok: false, output: '', error: 'Empty verify_command.' }
  }

  const conversationId = ctx.opts.conversationId?.trim()
  const workspacePath = conversationId ? getWorkspacePath(conversationId) : null
  const sandboxRoot = ctx.sandbox?.getRoot()?.trim()

  let cwd: string
  if (workspacePath) {
    cwd = workspacePath
  } else if (sandboxRoot) {
    log.warn('No workspace folder set; running verify_command in sandbox root', {
      conversationId,
      cwd: sandboxRoot,
      command,
    })
    cwd = sandboxRoot
  } else {
    return {
      ok: false,
      output: '',
      error:
        'No workspace folder or sandbox available; cannot run verify_command.',
    }
  }

  const { executable, args } = resolveShellInvocation(command)
  const result = await new Promise<{
    stdout: string
    stderr: string
    exitCode: number
    timedOut: boolean
  }>((resolve) => {
    execFile(
      executable,
      args,
      {
        cwd,
        timeout: VERIFY_COMMAND_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 2,
        shell: false,
        env: process.env,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            exitCode: 0,
            timedOut: false,
          })
          return
        }
        const err = error as NodeJS.ErrnoException & {
          code?: number | string
          killed?: boolean
          signal?: NodeJS.Signals | null
        }
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          exitCode: typeof err.code === 'number' ? err.code : 1,
          timedOut: err.killed === true && err.signal === 'SIGTERM',
        })
      },
    )
  })

  const output = formatCommandOutput(result.stdout, result.stderr)
  const outputBlock = `$ ${command}\n${output}`.trim()

  if (result.timedOut) {
    return {
      ok: false,
      output: outputBlock,
      error: `verify_command timed out after ${VERIFY_COMMAND_TIMEOUT_MS / 1000}s.`,
    }
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      output: outputBlock,
      error: `verify_command failed with exit code ${result.exitCode}.`,
    }
  }
  return { ok: true, output: outputBlock }
}
