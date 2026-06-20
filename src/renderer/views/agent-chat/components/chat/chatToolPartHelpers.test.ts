import { describe, expect, it } from 'vitest'
import {
  classifyToolResult,
  extractTerminalView,
  isTerminalCommandToolPart,
  isTerminalToolRunning,
} from './chatToolPartHelpers'

function toolPart(
  name: string,
  opts: { input?: unknown; output?: unknown; state?: string } = {},
) {
  return {
    type: `tool-${name}`,
    state: opts.state ?? 'output-available',
    input: opts.input,
    output: opts.output,
  }
}

describe('classifyToolResult', () => {
  it('classifies file-change tools as file', () => {
    expect(
      classifyToolResult(
        toolPart('edit_file', {
          output: {
            resultType: 'file_change',
            written: true,
            files: [{ diff: '...' }],
            workspacePath: '/ws',
          },
        }),
      ),
    ).toBe('file')
    expect(
      classifyToolResult(toolPart('apply_patch', { output: { applied: true, files: [] } })),
    ).toBe('file')
  })

  it('classifies run_script / run_workspace_command / git_* as terminal', () => {
    expect(
      classifyToolResult(
        toolPart('run_script', { output: { success: true, resultContent: 'hi' } }),
      ),
    ).toBe('terminal')
    expect(
      classifyToolResult(
        toolPart('run_workspace_command', { output: { stdout: 'ok', stderr: '', exitCode: 0 } }),
      ),
    ).toBe('terminal')
    expect(
      classifyToolResult(toolPart('git_status', { output: { stdout: ' M a.ts', exitCode: 0 } })),
    ).toBe('terminal')
    expect(
      classifyToolResult(
        toolPart('github_issue_list', { output: { stdout: '#1 open', exitCode: 0 } }),
      ),
    ).toBe('terminal')
  })

  it('classifies by terminal SHAPE even for an unknown tool name', () => {
    expect(
      classifyToolResult(toolPart('some_runner', { output: { stdout: 'x', exitCode: 1 } })),
    ).toBe('terminal')
  })

})

describe('isTerminalCommandToolPart', () => {
  it('is true for command tools and false for others', () => {
    expect(isTerminalCommandToolPart(toolPart('run_script'))).toBe(true)
    expect(isTerminalCommandToolPart(toolPart('git_commit'))).toBe(true)
    expect(isTerminalCommandToolPart(toolPart('run_workspace_command'))).toBe(true)
    expect(isTerminalCommandToolPart(toolPart('read_file'))).toBe(false)
    expect(isTerminalCommandToolPart(toolPart('edit_file'))).toBe(false)
  })
})

describe('isTerminalToolRunning', () => {
  it('is true while streaming or awaiting output after approval', () => {
    expect(
      isTerminalToolRunning(toolPart('run_script', { state: 'input-streaming' })),
    ).toBe(true)
    expect(
      isTerminalToolRunning(toolPart('run_script', { state: 'input-available' })),
    ).toBe(true)
    expect(
      isTerminalToolRunning(
        toolPart('run_script', {
          state: 'approval-responded',
          input: { scriptContent: 'sleep 1' },
        }),
      ),
    ).toBe(true)
  })

  it('is false once output or error is available', () => {
    expect(
      isTerminalToolRunning(
        toolPart('run_script', {
          state: 'approval-responded',
          output: { success: true, resultContent: 'done' },
        }),
      ),
    ).toBe(false)
    expect(
      isTerminalToolRunning(
        toolPart('run_script', {
          state: 'output-error',
          output: { error: 'boom' },
        }),
      ),
    ).toBe(false)
  })
})

describe('extractTerminalView', () => {
  it('uses scriptContent as the command for run_script', () => {
    const v = extractTerminalView(
      toolPart('run_script', {
        input: { scriptType: 'bash', scriptContent: 'echo hi' },
        output: { success: true, resultContent: 'hi\n' },
      }),
    )
    expect(v.command).toBe('echo hi')
    expect(v.output).toBe('hi')
    expect(v.success).toBe(true)
  })

  it('joins argv for run_workspace_command and surfaces stdout/stderr + exit code', () => {
    const v = extractTerminalView(
      toolPart('run_workspace_command', {
        input: { command: ['npm', 'test'] },
        output: { stdout: 'pass', stderr: 'warn', exitCode: 0 },
      }),
    )
    expect(v.command).toBe('npm test')
    expect(v.output).toBe('pass\n\nwarn')
    expect(v.exitCode).toBe(0)
  })

  it('renders a readable git command', () => {
    const v = extractTerminalView(
      toolPart('git_commit', {
        input: { message: 'feat: x' },
        output: { stdout: '[main abc] feat: x', exitCode: 0 },
      }),
    )
    expect(v.command).toBe('git commit -m "feat: x"')
    expect(v.output).toContain('feat: x')
  })

  it('falls back to JSON output when there is no stdout/stderr', () => {
    const v = extractTerminalView(
      toolPart('run_script', { input: { scriptContent: 'x' }, output: { foo: 1 } }),
    )
    expect(v.output).toContain('"foo"')
  })
})
