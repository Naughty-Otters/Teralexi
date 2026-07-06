import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isWin } from '@test-paths'
import {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  TERALEXI_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
  setSandboxOutputScope,
} from './sandbox-paths'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
  execFile: execFileMock,
}))

import {
  buildCreateScriptInstruction,
  buildRunScriptInstruction,
  runScript,
  runScriptFile,
} from './shell-command'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV]
  }
}

function findScriptProcessCall(
  calls: ReturnType<typeof execFileMock.mock.calls>,
) {
  return calls.find((call) => {
    const argv = call[1] as string[]
    if (!Array.isArray(argv)) return false
    if (argv.includes('py_compile') || argv.includes('-m') || argv.includes('--check')) {
      return false
    }
    return argv.some(
      (a) =>
        typeof a === 'string' &&
        (a.endsWith('.py') || a.endsWith('.sh') || a.endsWith('.js')),
    )
  })
}

function mockExecSuccess(stdout = 'ok\n') {
  execFileMock.mockImplementation(
    (
      _file: string,
      _args: string[],
      opts: unknown,
      maybeCb?: unknown,
    ) => {
      const cb =
        typeof opts === 'function'
          ? (opts as (err: Error | null, stdout: string, stderr: string) => void)
          : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
      cb(null, stdout, '')
      return undefined as never
    },
  )
}

describe('buildRunScriptInstruction', () => {
  it('builds markdown for python and javascript', () => {
    const py = buildRunScriptInstruction('python', 'print("hi")')
    expect(py).toContain('scriptType')
    expect(py).toContain('python')
    expect(py).toContain('print("hi")')

    const js = buildRunScriptInstruction('javascript', 'console.log(1)')
    expect(js).toContain('javascript')
    expect(buildCreateScriptInstruction).toBe(buildRunScriptInstruction)
  })
})

describe('shell-command tools', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-shell-test-'))
    await mkdir(path.join(sandboxRoot, 'scripts'), { recursive: true })
    await mkdir(path.join(sandboxRoot, 'output', 'scripts'), { recursive: true })
    await mkdir(path.join(sandboxRoot, 'output', 'results'), { recursive: true })
    setSandboxRoot(sandboxRoot)
    execFileMock.mockReset()
  })

  afterEach(() => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    setSandboxOutputScope(undefined)
  })

  it('runScript fails without active sandbox', async () => {
    setSandboxRoot(undefined)
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'print(1)',
    })
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('sandbox'),
    })
  })

  it('runScriptFile fails without active sandbox', async () => {
    setSandboxRoot(undefined)
    const result = await runScriptFile.execute({
      scriptType: 'python',
      scriptRelativePath: 'scripts/a.py',
    })
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('sandbox'),
    })
  })

  it('runScript executes python in sandbox', async () => {
    mockExecSuccess('done\n')
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'print("done")',
    })
    expect(result).toMatchObject({ success: true })
    expect(execFileMock).toHaveBeenCalled()
  })

  it.skipIf(isWin)('runScript executes bash scripts', async () => {
    mockExecSuccess('bash-ok\n')
    const result = await runScript.execute({
      scriptType: 'bash',
      scriptContent: 'echo bash-ok',
    })
    expect(result).toMatchObject({ success: true })
    const fileArg = execFileMock.mock.calls[0]?.[0]
    expect(String(fileArg)).toMatch(/bash|sh/)
  })

  it('runScriptFile runs existing script under scripts/', async () => {
    const scriptPath = path.join(sandboxRoot, 'scripts', 'hello.py')
    await writeFile(scriptPath, 'print("file")\n', 'utf-8')
    mockExecSuccess('file-out\n')

    const result = await runScriptFile.execute({
      scriptType: 'python',
      scriptRelativePath: 'hello.py',
    })
    expect(result).toMatchObject({ success: true })
  })

  it('runScriptFile returns detail when script missing', async () => {
    const result = await runScriptFile.execute({
      scriptType: 'python',
      scriptRelativePath: 'missing.py',
    })
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('not found'),
    })
  })

  it('rejects invalid input schema', async () => {
    const result = await runScript.execute({ scriptType: 'python' })
    expect(result).toMatchObject({ success: false })
  })

  it('exports split run_script tool names', () => {
    expect(runScript.name).toBe('run_script')
    expect(runScriptFile.name).toBe('run_script_file')
  })

  it('uses tool-loop step folder as cwd when scope is active', async () => {
    const scope = 'step-cwd-1'
    setSandboxOutputScope(scope)
    mockExecSuccess('ok\n')
    await runScript.execute({
      scriptType: 'python',
      scriptContent: 'print(1)',
    })
    expect(execFileMock).toHaveBeenCalled()
    const runCall = findScriptProcessCall(execFileMock.mock.calls)
    expect(runCall).toBeDefined()
    const opts = runCall![2] as { cwd?: string; env?: NodeJS.ProcessEnv }
    expect(opts.cwd).toBe(
      path.join(sandboxRoot, 'output', 'toolLoop', scope),
    )
    expect(opts.env?.TERALEXI_REFERENCE_SCRIPTS_DIR).toBe(
      path.join(sandboxRoot, 'scripts'),
    )
    expect(opts.env?.TERALEXI_STEP_CWD).toBe(opts.cwd)
  })

  it('passes absolute script path to interpreter when cwd is step', async () => {
    const scope = 'abs-script-path'
    setSandboxOutputScope(scope)
    mockExecSuccess('ok\n')
    await runScript.execute({
      scriptType: 'python',
      scriptContent: 'print(1)',
    })
    const runCall = findScriptProcessCall(execFileMock.mock.calls)
    expect(runCall).toBeDefined()
    const argv = runCall![1] as string[]
    const scriptArg = argv.find(
      (a) => typeof a === 'string' && a.endsWith('.py'),
    )
    expect(scriptArg).toBeDefined()
    expect(path.isAbsolute(scriptArg!)).toBe(true)
    expect(scriptArg).toContain(sandboxRoot)
    expect(scriptArg).not.toMatch(/^\.[/\\]/)
  })

  it('run_script_file resolves scripts from sandbox scripts when cwd is step', async () => {
    const scope = 'step-ref-1'
    setSandboxOutputScope(scope)
    const parentScript = path.join(sandboxRoot, 'scripts', 'helper.py')
    await writeFile(parentScript, 'print("helper")\n', 'utf-8')
    mockExecSuccess('helper-out\n')
    const result = await runScriptFile.execute({
      scriptType: 'python',
      scriptRelativePath: 'helper.py',
    })
    expect(result).toMatchObject({ success: true, pathIsRelativeTo: 'step' })
    const call = execFileMock.mock.calls[0]!
    const argv = call[1] as string[]
    expect(argv).toContain(parentScript)
  })

  it('includes deliverables written at step root, not only results/', async () => {
    const scope = 'root-deliverable'
    setSandboxOutputScope(scope)
    execFileMock.mockImplementation(
      (
        _executable: string,
        args: string[],
        opts: unknown,
        maybeCb?: unknown,
      ) => {
        const cb =
          typeof opts === 'function'
            ? (opts as (err: Error | null, stdout: string, stderr: string) => void)
            : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
        const isPreflight =
          args[0] === '-m' || args[0] === '-n' || args[0] === '--check'
        if (isPreflight) {
          cb(null, '', '')
          return
        }
        const cwd = (opts as { cwd?: string })?.cwd
        if (cwd) {
          writeFileSync(path.join(cwd, 'summary.md'), '# step root summary\n')
        }
        cb(null, '', '')
      },
    )
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'open("summary.md","w").write("# step root summary\\n")',
    })
    const row = result as {
      success?: boolean
      artifacts?: Array<{ role: string; relPath?: string }>
    }
    expect(row.success).toBe(true)
    const deliverables = row.artifacts?.filter(
      (a) => a.role === 'primary' || a.role === 'sidecar',
    )
    expect(
      deliverables?.some((a) => a.relPath?.endsWith('summary.md')),
    ).toBe(true)
    expect(
      deliverables?.some((a) => a.relPath?.includes('/scripts/')),
    ).toBe(false)
  })

  it('returns artifacts with primary file when script writes under step results', async () => {
    const scope = 'art-scope'
    setSandboxOutputScope(scope)
    execFileMock.mockImplementation(
      (
        _executable: string,
        args: string[],
        opts: unknown,
        maybeCb?: unknown,
      ) => {
        const cb =
          typeof opts === 'function'
            ? (opts as (err: Error | null, stdout: string, stderr: string) => void)
            : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
        const isPreflight =
          args[0] === '-m' || args[0] === '-n' || args[0] === '--check'
        if (isPreflight) {
          cb(null, '', '')
          return
        }
        const cwd = (opts as { cwd?: string })?.cwd
        if (cwd) {
          const outDir = path.join(cwd, 'results')
          mkdirSync(outDir, { recursive: true })
          writeFileSync(path.join(outDir, 'deliverable.md'), '# deliverable\n')
        }
        cb(null, '', '')
      },
    )
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'open("results/deliverable.md","w").write("# deliverable\\n")',
      resultFileRelativePath: 'results/deliverable.md',
    })
    const row = result as {
      success?: boolean
      artifacts?: Array<{ role: string; path?: string }>
      resultContent?: string
      primaryArtifactRelPath?: string
    }
    expect(row.success).toBe(true)
    expect(row.artifacts?.some((a) => a.role === 'primary')).toBe(true)
    expect(row.primaryArtifactRelPath).toMatch(/deliverable\.md$/)
    const primary = row.artifacts?.find((a) => a.role === 'primary')
    expect(primary?.path && existsSync(primary.path)).toBe(true)
    expect(String(row.resultContent)).toContain('deliverable')
  })

  it('preflight rejects invalid python before exec', async () => {
    execFileMock.mockImplementation(
      (
        _executable: string,
        args: string[],
        opts: unknown,
        maybeCb?: unknown,
      ) => {
        const cb =
          typeof opts === 'function'
            ? (opts as (err: Error | null, stdout: string, stderr: string) => void)
            : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
        const isPreflight =
          args.includes('py_compile') ||
          args.includes('-m') ||
          args.includes('--check')
        if (isPreflight) {
          cb(new Error('preflight syntax error'), '', '')
          return
        }
        cb(null, '', '')
      },
    )
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'def broken(\n',
    })
    expect(result).toMatchObject({
      success: false,
      phase: 'preflight',
    })
    expect(findScriptProcessCall(execFileMock.mock.calls)).toBeUndefined()
  })

  it('writes run_script artifacts under scoped tool-loop dir', async () => {
    const scope = 'step-scope-1'
    setSandboxOutputScope(scope)
    mockExecSuccess('scoped\n')
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'print("scoped")',
      captureRelativePath: 'cap.txt',
    })
    expect(result).toMatchObject({ success: true })
    const captureAbs = (result as { captureAbsolutePath?: string })
      .captureAbsolutePath
    expect(captureAbs).toBe(
      path.join(
        sandboxRoot,
        'output',
        'toolLoop',
        scope,
        'results',
        'cap.txt',
      ),
    )
    const scopedScriptsDir = path.join(
      sandboxRoot,
      'output',
      'toolLoop',
      scope,
      'scripts',
    )
    const { readdir } = await import('node:fs/promises')
    const scriptEntries = await readdir(scopedScriptsDir)
    expect(scriptEntries.some((name) => name.endsWith('.py'))).toBe(true)
  })

  it('exposes TERALEXI_WORKSPACE_PATH when workspace is set', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-ws-'))
    setWorkspaceRoot(workspaceRoot)
    mockExecSuccess('ok\n')
    await runScript.execute({
      scriptType: 'python',
      scriptContent: 'print(1)',
    })
    const runCall = findScriptProcessCall(execFileMock.mock.calls)
    expect(runCall).toBeDefined()
    const opts = runCall![2] as { env?: NodeJS.ProcessEnv }
    expect(opts.env?.TERALEXI_WORKSPACE_PATH).toBe(path.resolve(workspaceRoot))
  })

  it('resolves scriptArgs to workspace paths for reads', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-ws-read-'))
    setWorkspaceRoot(workspaceRoot)
    const inputFile = path.join(workspaceRoot, 'data', 'input.csv')
    await mkdir(path.dirname(inputFile), { recursive: true })
    await writeFile(inputFile, 'a,b\n1,2', 'utf8')
    mockExecSuccess('ok\n')
    await runScript.execute({
      scriptType: 'python',
      scriptContent: 'import sys; print(sys.argv[1])',
      scriptArgs: ['data/input.csv'],
    })
    const runCall = findScriptProcessCall(execFileMock.mock.calls)
    expect(runCall).toBeDefined()
    const argv = runCall![1] as string[]
    expect(argv).toContain(inputFile)
  })

  it('warns when script writes into the user workspace', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-ws-write-'))
    setWorkspaceRoot(workspaceRoot)
    execFileMock.mockImplementation(
      (
        _executable: string,
        args: string[],
        opts: unknown,
        maybeCb?: unknown,
      ) => {
        const cb =
          typeof opts === 'function'
            ? (opts as (err: Error | null, stdout: string, stderr: string) => void)
            : (maybeCb as (err: Error | null, stdout: string, stderr: string) => void)
        const isPreflight =
          args[0] === '-m' || args[0] === '-n' || args[0] === '--check'
        if (isPreflight) {
          cb(null, '', '')
          return
        }
        writeFileSync(path.join(workspaceRoot, 'polluted.txt'), 'bad', 'utf8')
        cb(null, '', '')
      },
    )
    const result = await runScript.execute({
      scriptType: 'python',
      scriptContent: 'open("/tmp/x","w")',
    })
    expect(result).toMatchObject({
      success: true,
      workspaceWriteWarning: expect.stringContaining('user workspace'),
      workspaceWrites: ['polluted.txt'],
    })
  })
})
