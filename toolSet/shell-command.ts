import { execFile, type ExecException } from 'child_process'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import crypto from 'crypto'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { agentRunEnvFromScope } from '@main/agent/run/run-scope'
import {
  ensureToolLoopStepOutputDirs,
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  getSandboxOutputScopeFromEnv,
  getSandboxRootFromEnv,
  getWorkspacePathFromEnv,
  isSandboxArtifactRelativePath,
  remapLegacySharedOutputPath,
  resolveSandboxRelativePath,
  resolveUserProjectPath,
  toolLoopOutputRelBase,
} from './sandbox-paths'
import {
  detectWorkspaceWrites,
  snapshotWorkspaceGuard,
  WORKSPACE_WRITE_WARNING,
} from './run-script-workspace-guard'
import {
  buildScriptArtifacts,
  filterDeliverableChangedPaths,
  findChangedFiles,
  readPrimaryArtifactPreview,
  snapshotDeliverableFiles,
} from './run-script-artifacts'
import { runScriptPreflight } from './run-script-preflight'
import { formatCommandOutput } from '@shared/tool-result/terminal-capture'

/** LLM-facing labels; `javascript` maps to Node like `nodejs`. */
const scriptTypeEnum = z.enum(['bash', 'python', 'nodejs', 'javascript'])

/**
 * Required on run-script tools: selects execFile executable and script file extension
 * (`.sh` / `.py` / `.js`). `javascript` and `nodejs` both use the Node runtime.
 * Declared first on each tool input object so generated JSON Schema lists it as a
 * top-level required field and models omit it less often.
 */
const scriptTypeRequired = scriptTypeEnum.describe(
  'Required. One of: bash | python | nodejs | javascript. Must match the language of scriptContent or the script file being run.',
)

export type { NormalizedScriptType } from './run-script-types'
import type { NormalizedScriptType } from './run-script-types'

function normalizeScriptType(
  t: z.infer<typeof scriptTypeEnum>,
): NormalizedScriptType {
  return t === 'javascript' ? 'nodejs' : t
}

/**
 * Shared optional fields for run-script tools (all inputs except `scriptType`,
 * which is declared explicitly and first on each tool’s input object).
 */
const sharedRunScriptFieldsRest = {
  scriptArgs: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      'Argv after the script path (positional args to your script). When passing paths, use sandbox-relative paths from the sandbox root.',
    ),
  captureRelativePath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional path for stdout/stderr capture; normalized under the active tool-loop step `output/toolLoop/<step>/results/` when scoped, else `<sandbox>/output/results/`.',
    ),
  resultFileRelativePath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'If set and exit code is 0, read this sandbox-relative file as `resultContent` when the script writes its main output there; otherwise `resultContent` comes from the capture file.',
    ),
  timeoutMs: z
    .number()
    .int()
    .min(100)
    .max(120000 * 5)
    .optional()
    .default(120000 * 5)
    .describe(
      'Maximum time in ms to wait for the interpreter process (default 10 minutes).',
    ),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Extra environment variables for the script process (merged with the default env).',
    ),
  /**
   * Working directory for the interpreter process.
   * Only `"sandbox"` is supported: cwd is the active tool-loop step folder (or sandbox root).
   * Scripts may read the user project via `TERALEXI_WORKSPACE_PATH` or workspace paths in
   * `scriptArgs`; use `run_workspace_command` for npm/git/test in the project folder.
   */
  workingDirectory: z
    .enum(['sandbox'])
    .optional()
    .default('sandbox')
    .describe(
      'Must be "sandbox" (default). Process cwd is the sandbox step folder. Read workspace files via TERALEXI_WORKSPACE_PATH or path-like scriptArgs; use run_workspace_command for project commands.',
    ),
} as const

const runSandboxScriptContentInput = z.object({
  scriptType: scriptTypeRequired,
  ...sharedRunScriptFieldsRest,
  /** Write this source to `output/scripts/` then run; language must match `scriptType`. */
  scriptContent: z
    .string()
    .min(1)
    .describe(
      'Script source executed after write; must match scriptType (bash / python / node).',
    ),
  /**
   * Existing files from `<sandbox>/scripts` whose contents are read and prepended
   * before `scriptContent` in the internally materialized script file.
   */
  referencedScriptFiles: z.array(z.string().min(1)).optional().default([]),
})

const runSandboxScriptFileInput = z.object({
  scriptType: scriptTypeRequired,
  ...sharedRunScriptFieldsRest,
  /**
   * Path to an existing script in `<sandbox>/scripts`,
   * e.g. `scripts/foo.sh` or just `foo.sh`.
   */
  scriptRelativePath: z.string().min(1),
})

function getSandboxOrError():
  | { ok: true; root: string }
  | { ok: false; message: string } {
  const root = getSandboxRootFromEnv()
  if (!root) {
    return {
      ok: false,
      message:
        'No active agent sandbox. Shell execution is only available during an agent run with a sandbox.',
    }
  }
  return { ok: true, root: path.resolve(root) }
}

/**
 * Interpreter argv must use an absolute script path so step/workspace cwd
 * cannot break resolution of a sandbox-relative script location.
 */
function ensureAbsoluteScriptPath(sandboxRoot: string, scriptPath: string): string {
  const trimmed = scriptPath.trim()
  if (!trimmed) return trimmed
  const normalized = path.normalize(trimmed)
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(sandboxRoot, normalized)
}

/** Ordered script search roots: step scripts, then planning copies under `<sandbox>/scripts`. */
function scriptSearchRoots(sandboxRoot: string): string[] {
  const roots: string[] = []
  const push = (dir: string) => {
    const normalized = path.normalize(dir)
    if (!roots.includes(normalized)) roots.push(normalized)
  }
  push(path.join(sandboxRoot, getOutputScriptsRelPrefix()))
  push(path.join(sandboxRoot, 'scripts'))
  return roots
}

function tryResolveUnderScriptsRoot(
  scriptsRoot: string,
  userPath: string,
): string | null {
  try {
    const stripped = userPath.trim().replace(/^[/\\]+/, '')
    const segments = stripped.split(/[/\\]+/).filter(Boolean)
    const relativeSegments =
      segments[0] === 'scripts' ? segments.slice(1) : segments
    if (relativeSegments.length === 0) return null
    const resolved = path.normalize(
      path.resolve(scriptsRoot, ...relativeSegments),
    )
    const relToScripts = path.relative(scriptsRoot, resolved)
    if (relToScripts.startsWith('..') || path.isAbsolute(relToScripts)) {
      return null
    }
    return resolved
  } catch {
    return null
  }
}

/**
 * Candidate absolute paths for `run_script_file` / `referencedScriptFiles`.
 * Searches the active step scripts dir first, then `<sandbox>/scripts` (planning copies).
 */
function collectScriptPathCandidates(root: string, userPath: string): string[] {
  const ordered: string[] = []
  const pushRel = (rel: string, scriptsRoot: string) => {
    const p = tryResolveUnderScriptsRoot(scriptsRoot, rel)
    if (p && !ordered.includes(p)) ordered.push(p)
  }

  const raw = userPath.trim()
  const stripped = raw.replace(/^[/\\]+/, '')
  const segments = stripped.split(/[/\\]+/).filter(Boolean)
  const base = segments.length ? segments[segments.length - 1] : ''

  for (const scriptsRoot of scriptSearchRoots(root)) {
    if (raw.length > 0) pushRel(raw, scriptsRoot)
    if (base.length > 0 && segments.length === 1) pushRel(base, scriptsRoot)
    if (segments[0] === 'scripts' && segments.length >= 2) {
      pushRel(path.join(...segments), scriptsRoot)
    }
    if (stripped.length > 0 && !/^scripts[/\\]/i.test(stripped)) {
      pushRel(stripped, scriptsRoot)
    }
    if (base.length > 0) pushRel(base, scriptsRoot)
  }

  return ordered
}

/** Tool-loop step base: `output/toolLoop/<scope>/` (contains `results/` and `scripts/`). */
function resolveToolLoopStepBaseDir(sandboxRoot: string): string | null {
  const scope = getSandboxOutputScopeFromEnv()
  if (!scope) return null
  ensureToolLoopStepOutputDirs(sandboxRoot, scope)
  return path.join(sandboxRoot, toolLoopOutputRelBase(scope))
}

/**
 * Where to scan for LLM deliverables after run_script:
 * - scoped step: entire `output/toolLoop/<step>/` except `scripts/`
 * - no step: shared `output/results/` only
 */
function resolveDeliverableWatchRoot(sandboxRoot: string): string {
  const stepBase = resolveToolLoopStepBaseDir(sandboxRoot)
  if (stepBase) return stepBase
  return path.join(sandboxRoot, getOutputResultsRelPrefix())
}

function resolveScriptProcessCwd(
  sandboxRoot: string,
): { cwd: string; cwdKind: 'step' | 'sandbox_root' } {
  const stepBase = resolveToolLoopStepBaseDir(sandboxRoot)
  if (stepBase) {
    return { cwd: stepBase, cwdKind: 'step' }
  }
  return { cwd: sandboxRoot, cwdKind: 'sandbox_root' }
}

function looksLikeSandboxPathArg(arg: string): boolean {
  const t = arg.trim()
  if (!t || t.startsWith('-')) return false
  if (t.includes('/') || t.includes('\\')) return true
  return /\.(py|sh|js|mjs|cjs|ts|json|md|txt|csv)$/i.test(t)
}

/**
 * Resolve path-like scriptArgs: sandbox artifact paths and existing sandbox files
 * first; otherwise resolve against the user workspace for read access.
 */
function resolveScriptArgs(
  sandboxRoot: string,
  workspacePath: string | null,
  scriptArgs: string[],
): string[] {
  return scriptArgs.map((arg) => {
    if (!looksLikeSandboxPathArg(arg)) return arg

    const remapped = remapLegacySharedOutputPath(arg)
    if (isSandboxArtifactRelativePath(remapped)) {
      try {
        return resolveSandboxRelativePath(sandboxRoot, remapped)
      } catch {
        return arg
      }
    }

    try {
      const sandboxAbs = resolveSandboxRelativePath(sandboxRoot, remapped)
      if (existsSync(sandboxAbs)) return sandboxAbs
    } catch {
      // try workspace next
    }

    if (workspacePath) {
      try {
        return resolveUserProjectPath(workspacePath, arg)
      } catch {
        // fall through
      }
    }

    try {
      return resolveSandboxRelativePath(sandboxRoot, remapped)
    } catch {
      return arg
    }
  })
}

function buildScriptProcessEnv(options: {
  sandboxRoot: string
  cwd: string
  workspacePath?: string | null
  extra?: Record<string, string>
}): NodeJS.ProcessEnv {
  const { sandboxRoot, cwd, workspacePath, extra } = options
  const stepBase = resolveToolLoopStepBaseDir(sandboxRoot)
  return {
    ...process.env,
    ...agentRunEnvFromScope(),
    ...extra,
    TERALEXI_SANDBOX_ROOT: sandboxRoot,
    TERALEXI_STEP_CWD: cwd,
    TERALEXI_RESULTS_DIR: path.join(sandboxRoot, getOutputResultsRelPrefix()),
    TERALEXI_SCRIPTS_DIR: path.join(sandboxRoot, getOutputScriptsRelPrefix()),
    TERALEXI_REFERENCE_SCRIPTS_DIR: path.join(sandboxRoot, 'scripts'),
    ...(stepBase ? { TERALEXI_TOOL_LOOP_STEP_DIR: stepBase } : {}),
    ...(workspacePath
      ? { TERALEXI_WORKSPACE_PATH: path.resolve(workspacePath) }
      : {}),
  }
}

async function resolveExistingScriptPath(
  root: string,
  userPath: string,
): Promise<{ ok: true; scriptPath: string } | { ok: false; detail: string }> {
  const candidates = collectScriptPathCandidates(root, userPath)
  for (const p of candidates) {
    try {
      await fs.access(p)
      return { ok: true, scriptPath: ensureAbsoluteScriptPath(root, p) }
    } catch {
      // try next
    }
  }

  const hints: string[] = []
  for (const scriptsRoot of scriptSearchRoots(root)) {
    try {
      const names = await fs.readdir(scriptsRoot)
      const files = names.filter((n) => n && !n.startsWith('.')).slice(0, 8)
      if (files.length > 0) {
        const rel = path.relative(root, scriptsRoot).split(path.sep).join('/') || 'scripts'
        hints.push(`${rel}/: ${files.join(', ')}`)
      }
    } catch {
      // ignore
    }
  }
  const hint = hints.length ? ` Known script dirs: ${hints.join('; ')}.` : ''

  return {
    ok: false,
    detail: `Script file not found after trying: ${candidates.length ? candidates.join(' | ') : userPath}.${hint} Use \`scripts/foo.sh\`, a step-local script path, or \`run_script\` to create one.`,
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

function getShellCommand() {
  if (process.platform === 'win32') {
    const shell = process.env['ComSpec'] || 'cmd.exe'
    return { shell, shellLabel: 'cmd' }
  }
  const shell = process.env['SHELL'] || '/bin/bash'
  return { shell, shellLabel: path.basename(shell) }
}

function getScriptRuntime(kind: NormalizedScriptType) {
  if (kind === 'bash') {
    const shellConfig = getShellCommand()
    return {
      executable: shellConfig.shell,
      runtimeLabel: shellConfig.shellLabel,
      extension: process.platform === 'win32' ? '.cmd' : '.sh',
      argsForFile: (filePath: string) => [filePath],
      fallbacks: [] as string[],
    }
  }

  if (kind === 'python') {
    return {
      executable: 'python3',
      runtimeLabel: 'python3',
      extension: '.py',
      argsForFile: (filePath: string) => [filePath],
      fallbacks: ['python'],
    }
  }

  return {
    executable: 'node',
    runtimeLabel: 'node',
    extension: '.js',
    argsForFile: (filePath: string) => [filePath],
    fallbacks: [] as string[],
  }
}

async function executeFileWithFallbacks(options: {
  executable: string
  fallbacks: string[]
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
}) {
  const { executable, fallbacks, args, cwd, env, timeoutMs } = options
  const candidates = [executable, ...fallbacks]
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const result = await new Promise<{
        stdout: string
        stderr: string
        exitCode: number
        signal: NodeJS.Signals | null
      }>((resolve, reject) => {
        execFile(
          candidate,
          args,
          {
            cwd,
            env,
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 1024,
            shell: true,
          },
          (error, stdout, stderr) => {
            if (!error) {
              resolve({ stdout, stderr, exitCode: 0, signal: null })
              return
            }

            const execError = error as ExecException & {
              code?: number | string
              killed?: boolean
              signal?: NodeJS.Signals | null
            }
            const errorCode =
              typeof execError.code === 'string' ? execError.code : undefined

            if (errorCode === 'ENOENT') {
              reject(execError)
              return
            }

            resolve({
              stdout,
              stderr,
              exitCode: typeof execError.code === 'number' ? execError.code : 1,
              signal: execError.signal ?? null,
            })
          },
        )
      })

      return {
        ...result,
        runtime: candidate,
        timedOut: false,
        error: undefined,
      }
    } catch (error) {
      lastError = error
    }
  }

  const execError = lastError as (ExecException & { code?: string }) | null
  return {
    stdout: '',
    stderr: '',
    exitCode: 1,
    signal: execError?.signal ?? null,
    runtime: executable,
    timedOut: false,
    error: execError ? String(execError) : 'Failed to start script runtime.',
  }
}

function formatCaptureBody(stdout: string, stderr: string): string {
  const parts: string[] = []
  if (stdout.trim()) {
    parts.push('--- stdout ---\n' + stdout.trimEnd())
  }
  if (stderr.trim()) {
    parts.push('--- stderr ---\n' + stderr.trimEnd())
  }
  return parts.join('\n\n').trim()
}

/**
 * Run capture files must live under the active tool-loop results dir (or shared
 * `output/results/` when no scope), not loose at the sandbox root.
 */
function normalizeCaptureRelativePath(userCapture: string | undefined): string {
  const fallback = `capture-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`
  const resultsPrefix = getOutputResultsRelPrefix()
  if (!userCapture?.trim()) {
    return path.join(resultsPrefix, fallback)
  }
  const remapped = remapLegacySharedOutputPath(userCapture)
  const seg = remapped.split(/[/\\]+/).filter(Boolean)
  const prefixSeg = resultsPrefix.split(/[/\\]+/).filter(Boolean)
  const underPrefix =
    seg.length >= prefixSeg.length &&
    prefixSeg.every((part, i) => seg[i] === part)
  if (underPrefix) {
    return path.join(...seg)
  }
  if (seg.length === 1) {
    return path.join(resultsPrefix, seg[0]!)
  }
  return path.join(resultsPrefix, path.basename(remapped))
}

/** Optional script output file: prefer under the active results dir if a bare name. */
function normalizeResultFileRelativePath(userPath: string | undefined): string {
  if (!userPath?.trim()) return ''
  const remapped = remapLegacySharedOutputPath(userPath)
  const seg = remapped.split(/[/\\]+/).filter(Boolean)
  const resultsPrefix = getOutputResultsRelPrefix()
  const prefixSeg = resultsPrefix.split(/[/\\]+/).filter(Boolean)
  const underPrefix =
    seg.length >= prefixSeg.length &&
    prefixSeg.every((part, i) => seg[i] === part)
  if (underPrefix) {
    return path.join(...seg)
  }
  if (seg.length === 1) {
    return path.join(resultsPrefix, seg[0]!)
  }
  return path.join(...seg)
}

async function writeScriptToSandbox(options: {
  root: string
  scriptType: NormalizedScriptType
  scriptContent: string
}): Promise<
  | {
      ok: true
      scriptPath: string
      relToSandbox: string
      scriptRelativePathPosix: string
    }
  | { ok: false; error: string; sandboxRoot?: string; attemptedPath?: string }
> {
  const { root, scriptType, scriptContent } = options
  const runtime = getScriptRuntime(scriptType)
  const scriptsDir = path.join(root, getOutputScriptsRelPrefix())
  await ensureDir(scriptsDir)

  const baseFromUser = `script-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const ensuredBase = baseFromUser.endsWith(runtime.extension)
    ? baseFromUser
    : `${baseFromUser}${runtime.extension}`

  let scriptPath = path.join(scriptsDir, ensuredBase)
  if (existsSync(scriptPath)) {
    let n = 1
    const stem = ensuredBase.endsWith(runtime.extension)
      ? ensuredBase.slice(0, -runtime.extension.length)
      : ensuredBase
    while (existsSync(scriptPath)) {
      scriptPath = path.join(scriptsDir, `${stem}-${n}${runtime.extension}`)
      n += 1
    }
  }

  try {
    await fs.writeFile(scriptPath, scriptContent, 'utf8')
  } catch (err) {
    return {
      ok: false,
      error: `Could not write script file: ${err instanceof Error ? err.message : String(err)}`,
      sandboxRoot: root,
      attemptedPath: scriptPath,
    }
  }

  if (scriptType === 'bash' && process.platform !== 'win32') {
    try {
      await fs.chmod(scriptPath, 0o700)
    } catch {
      // non-fatal
    }
  }

  let verified: string
  try {
    verified = await fs.readFile(scriptPath, 'utf8')
  } catch (err) {
    return {
      ok: false,
      error: `Script was not readable after write: ${err instanceof Error ? err.message : String(err)}`,
      sandboxRoot: root,
      attemptedPath: scriptPath,
    }
  }
  if (verified !== scriptContent) {
    return {
      ok: false,
      error: 'Write verification failed (disk content mismatch).',
      sandboxRoot: root,
      attemptedPath: scriptPath,
    }
  }

  const scriptAbsPath = ensureAbsoluteScriptPath(root, scriptPath)

  return {
    ok: true,
    scriptPath: scriptAbsPath,
    relToSandbox: path.relative(root, scriptAbsPath),
    scriptRelativePathPosix: path
      .relative(root, scriptAbsPath)
      .split(path.sep)
      .join('/'),
  }
}

function stripLeadingShebang(content: string): string {
  return content.replace(/^#!.*(?:\r?\n|$)/, '')
}

function getScriptCommentPrefix(scriptType: NormalizedScriptType): string {
  return scriptType === 'nodejs' ? '//' : '#'
}

function buildInjectedScriptContent(options: {
  scriptType: NormalizedScriptType
  referencedScripts: Array<{ scriptRelativePathPosix: string; content: string }>
  scriptContent: string
}): string {
  const { scriptType, referencedScripts, scriptContent } = options
  if (referencedScripts.length === 0) {
    return scriptContent
  }

  const commentPrefix = getScriptCommentPrefix(scriptType)
  const injectedParts = referencedScripts.map((script) => {
    const normalizedContent = stripLeadingShebang(script.content).trim()
    const header = `${commentPrefix} referenced script: ${script.scriptRelativePathPosix}`
    return normalizedContent ? `${header}\n${normalizedContent}` : header
  })

  return [...injectedParts, scriptContent].join('\n\n')
}

async function runScriptFileAndCapture(options: {
  /** Sandbox root — captures and result files are always written here. */
  root: string
  /** Working directory for the interpreter. Defaults to `root` when not supplied. */
  cwd?: string
  scriptPath: string
  scriptType: NormalizedScriptType
  scriptArgs: string[]
  captureRelativePath: string | undefined
  resultFileRelativePath: string | undefined
  timeoutMs: number
  env: Record<string, string> | undefined
}): Promise<Record<string, unknown>> {
  const {
    root,
    cwd: cwdOverride,
    scriptPath: scriptPathInput,
    scriptType,
    scriptArgs,
    captureRelativePath,
    resultFileRelativePath,
    timeoutMs,
    env,
  } = options

  const scriptPath = ensureAbsoluteScriptPath(root, scriptPathInput)
  const runtime = getScriptRuntime(scriptType)
  const cwd = cwdOverride ?? root
  const workspacePath = getWorkspacePathFromEnv()

  const resultsAbsDir = path.join(root, getOutputResultsRelPrefix())
  await ensureDir(resultsAbsDir)
  const deliverableWatchRoot = resolveDeliverableWatchRoot(root)
  const beforeSnapshot = await snapshotDeliverableFiles(deliverableWatchRoot)
  const workspaceBefore = workspacePath
    ? await snapshotWorkspaceGuard(workspacePath)
    : null

  const preflight = await runScriptPreflight({
    scriptType,
    scriptPath,
    sandboxRoot: root,
    resultFileRelativePath,
    resolveResultFileAbs: (rel) => {
      try {
        return resolveSandboxRelativePath(
          root,
          normalizeResultFileRelativePath(rel),
        )
      } catch {
        return null
      }
    },
  })
  if (preflight.ok === false) {
    return {
      success: false,
      phase: 'preflight',
      issues: preflight.issues,
      exitCode: 1,
      stdout: '',
      stderr: '',
      output: '',
      artifacts: [],
      sandboxRoot: root,
      cwd,
      scriptPath,
    }
  }

  const envVars = buildScriptProcessEnv({
    sandboxRoot: root,
    cwd,
    workspacePath,
    extra: env,
  })
  const resolvedArgs = resolveScriptArgs(root, workspacePath, scriptArgs)

  const result = await executeFileWithFallbacks({
    executable: runtime.executable,
    fallbacks: runtime.fallbacks,
    args: [...runtime.argsForFile(scriptPath), ...resolvedArgs],
    cwd,
    env: envVars,
    timeoutMs,
  })

  const captureRel = normalizeCaptureRelativePath(captureRelativePath)
  let captureAbs: string
  try {
    captureAbs = resolveSandboxRelativePath(root, captureRel)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e))
  }

  await ensureDir(path.dirname(captureAbs))
  const captureBody = formatCaptureBody(result.stdout, result.stderr)
  await fs.writeFile(captureAbs, captureBody || '(no stdout/stderr)', 'utf8')

  const success = result.exitCode === 0 && !result.error
  const consoleOutput = formatCommandOutput(result.stdout, result.stderr)

  let declaredPrimaryAbs: string | null = null
  if (resultFileRelativePath?.trim()) {
    try {
      const candidate = resolveSandboxRelativePath(
        root,
        normalizeResultFileRelativePath(resultFileRelativePath),
      )
      await fs.access(candidate)
      declaredPrimaryAbs = candidate
    } catch {
      declaredPrimaryAbs = null
    }
  }

  const afterSnapshot = await snapshotDeliverableFiles(deliverableWatchRoot)
  const changedPaths = filterDeliverableChangedPaths(
    findChangedFiles(beforeSnapshot, afterSnapshot),
    deliverableWatchRoot,
  )

  const artifacts = buildScriptArtifacts({
    sandboxRoot: root,
    scriptPath,
    captureAbsolutePath: captureAbs,
    declaredPrimaryAbs: success ? declaredPrimaryAbs : null,
    changedPaths: success ? changedPaths : [],
  })

  let resultContent: string | undefined
  let resultReadFrom: string | undefined

  if (success) {
    const primaryEntry = artifacts.find((a) => a.role === 'primary')
    if (primaryEntry) {
      const abs = path.isAbsolute(primaryEntry.path)
        ? primaryEntry.path
        : path.join(root, primaryEntry.relPath)
      try {
        const raw = await fs.readFile(abs, 'utf8')
        if (raw.trim()) {
          resultContent = raw
          resultReadFrom = primaryEntry.relPath
        }
      } catch {
        resultContent = undefined
      }
    }
    if (!resultContent?.trim()) {
      const primaryPreview = await readPrimaryArtifactPreview(artifacts, root)
      if (primaryPreview?.text.trim()) {
        resultContent = primaryPreview.text
        resultReadFrom = primaryPreview.relPath
      }
    }
    if (!resultContent?.trim()) {
      if (consoleOutput.trim()) {
        resultContent = consoleOutput
      } else {
        try {
          const captureText = await fs.readFile(captureAbs, 'utf8')
          if (
            captureText.trim() &&
            captureText.trim().toLowerCase() !== '(no stdout/stderr)'
          ) {
            resultContent = captureText
            resultReadFrom = path.relative(root, captureAbs).split(path.sep).join('/')
          }
        } catch {
          resultContent = undefined
        }
      }
    }
  }

  const primaryArtifact = artifacts.find((a) => a.role === 'primary')

  let workspaceWrites: string[] | undefined
  let workspaceWriteWarning: string | undefined
  if (workspacePath && workspaceBefore) {
    const workspaceAfter = await snapshotWorkspaceGuard(workspacePath)
    const writes = detectWorkspaceWrites({
      workspaceRoot: workspacePath,
      before: workspaceBefore,
      after: workspaceAfter,
    })
    if (writes.length > 0) {
      workspaceWrites = writes
      workspaceWriteWarning = WORKSPACE_WRITE_WARNING
    }
  }

  return {
    success,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    output: consoleOutput,
    captureAbsolutePath: captureAbs,
    resultContent,
    resultReadFrom,
    primaryArtifactRelPath: primaryArtifact?.relPath,
    artifacts,
    sandboxRoot: root,
    cwd,
    scriptPath,
    ...(workspaceWrites?.length
      ? { workspaceWrites, workspaceWriteWarning }
      : {}),
    ...(result.error ? { error: result.error } : {}),
  }
}

export const runScript: SkillTool = {
  name: 'run_script',
  tags: ['shell-command'],
  description:
    '**Input must include `scriptType`** (required string: `bash` | `python` | `nodejs` | `javascript`). Agent sandbox shell only: execFile(interpreter, [scriptFile, ...scriptArgs]) — no raw shell strings or pipes. When a tool-loop step is active, process cwd is that step folder (`output/toolLoop/<step>/`); write outputs under `./results/` (or `results/scratch/` for temp files) and use `resultFileRelativePath` for deliverables. Read user project files via `TERALEXI_WORKSPACE_PATH` or workspace-relative paths in `scriptArgs`. Use `promote_artifact` to copy deliverables into the workspace. Use `run_workspace_command` for npm/git/test in the project folder.',
  inputSchema: runSandboxScriptContentInput,
  needsApproval: false,
  async execute(input) {
    const parsed = runSandboxScriptContentInput.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() }
    }

    const sb = getSandboxOrError()
    if (sb.ok === false) {
      return { success: false, error: sb.message }
    }

    const {
      scriptType: rawType,
      scriptContent,
      referencedScriptFiles,
      scriptArgs,
      captureRelativePath,
      resultFileRelativePath,
      timeoutMs,
      env,
    } = parsed.data

    const { cwd: scriptCwd, cwdKind } = resolveScriptProcessCwd(sb.root)

    const scriptType = normalizeScriptType(rawType)
    const resolvedReferencedScripts: Array<{
      scriptRelativePathPosix: string
      content: string
    }> = []

    for (const referencedScriptFile of referencedScriptFiles) {
      const resolvedPath = await resolveExistingScriptPath(
        sb.root,
        referencedScriptFile.trim(),
      )
      if (resolvedPath.ok === false) {
        return { success: false, error: resolvedPath.detail }
      }

      try {
        const content = await fs.readFile(resolvedPath.scriptPath, 'utf8')
        resolvedReferencedScripts.push({
          scriptRelativePathPosix: path
            .relative(sb.root, resolvedPath.scriptPath)
            .split(path.sep)
            .join('/'),
          content,
        })
      } catch (err) {
        return {
          success: false,
          error: `Failed to read referenced script file ${referencedScriptFile}: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    const combinedScriptContent = buildInjectedScriptContent({
      scriptType,
      referencedScripts: resolvedReferencedScripts,
      scriptContent,
    })
    const written = await writeScriptToSandbox({
      root: sb.root,
      scriptType,
      scriptContent: combinedScriptContent,
    })
    if (written.ok === false) {
      return {
        success: false,
        error: written.error,
        sandboxRoot: written.sandboxRoot,
        attemptedPath: written.attemptedPath,
      }
    }

    try {
      const runOut = await runScriptFileAndCapture({
        root: sb.root,
        cwd: scriptCwd,
        scriptPath: written.scriptPath,
        scriptType,
        scriptArgs,
        captureRelativePath,
        resultFileRelativePath,
        timeoutMs,
        env,
      })
      return {
        ...runOut,
        referencedScriptFiles: resolvedReferencedScripts.map(
          (script) => script.scriptRelativePathPosix,
        ),
        pathIsRelativeTo: cwdKind,
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        referencedScriptFiles: resolvedReferencedScripts.map(
          (script) => script.scriptRelativePathPosix,
        ),
      }
    }
  },
}

/**
 * Run an existing script file already under the sandbox.
 */
export const runScriptFile: SkillTool = {
  name: 'run_script_file',
  tags: ['shell-command'],
  description:
    '**Input must include `scriptType`** (required string: `bash` | `python` | `nodejs` | `javascript`). Run a file from the step `scripts/` dir or planning copies under `<sandbox>/scripts/`. When a tool-loop step is active, cwd is `output/toolLoop/<step>/` (write outputs under `./results/`). Path-like scriptArgs resolve to sandbox files first, then the user workspace for reads. Use `promote_artifact` for intentional workspace deliverables.',
  inputSchema: runSandboxScriptFileInput,
  needsApproval: false,
  async execute(input) {
    const parsed = runSandboxScriptFileInput.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() }
    }

    const sb = getSandboxOrError()
    if (sb.ok === false) {
      return { success: false, error: sb.message }
    }

    const {
      scriptType: rawType,
      scriptRelativePath,
      scriptArgs,
      captureRelativePath,
      resultFileRelativePath,
      timeoutMs,
      env,
    } = parsed.data

    const { cwd: scriptCwd, cwdKind } = resolveScriptProcessCwd(sb.root)

    const scriptType = normalizeScriptType(rawType)
    const resolvedPath = await resolveExistingScriptPath(
      sb.root,
      scriptRelativePath.trim(),
    )
    if (resolvedPath.ok === false) {
      return { success: false, error: resolvedPath.detail }
    }

    const scriptRelativePathPosix = path
      .relative(sb.root, resolvedPath.scriptPath)
      .split(path.sep)
      .join('/')

    try {
      const runOut = await runScriptFileAndCapture({
        root: sb.root,
        cwd: scriptCwd,
        scriptPath: resolvedPath.scriptPath,
        scriptType,
        scriptArgs,
        captureRelativePath,
        resultFileRelativePath,
        timeoutMs,
        env,
      })
      return {
        ...runOut,
        pathIsRelativeTo: cwdKind,
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
}

/**
 * Instruction block for reference scripts: materialize and run via `run_script`.
 */
export function buildRunScriptInstruction(
  scriptType: 'bash' | 'python' | 'nodejs' | 'javascript',
  scriptContent: string,
): string {
  const st =
    scriptType === 'javascript'
      ? 'javascript'
      : scriptType === 'nodejs'
        ? 'nodejs'
        : scriptType
  return [
    `Materialize and execute this reference in one \`run_script\` call with:`,
    `- \`scriptType\`: "${st}"`,
    `- \`scriptContent\`: place the reference script below at the **start** of \`scriptContent\`, then extend as needed.`,
    `Optional: \`referencedScriptFiles\` (paths to files already in \`scripts/\`; their contents are prepended before \`scriptContent\`), \`scriptArgs\`, \`captureRelativePath\`, \`resultFileRelativePath\`. The tool creates the script file internally. Paths in args are relative to SANDBOX ROOT (📦).`,
    ``,
    `\`\`\`${
      scriptType === 'nodejs' || scriptType === 'javascript'
        ? 'javascript'
        : scriptType
    }`,
    scriptContent,
    `\`\`\``,
  ].join('\n')
}

/** @deprecated Use {@link buildRunScriptInstruction} */
export const buildCreateScriptInstruction = buildRunScriptInstruction
