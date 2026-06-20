/** LLM-facing sandbox workspace instructions injected into executor prompts. */

export const SANDBOX_LLM = {
  HEADER: '=== SANDBOX ===',
  FOOTER: '=== END SANDBOX ===',
  ROOT_LABEL:
    'SANDBOX ROOT (📦) — tool paths resolve from here; run_script_* cwd is the active step folder when scoped:',
  OUTPUT_DIR: 'Output directory (artifacts):',
  CAPTURES: '  run_script_* captures   →',
  SCRIPTS: '  run_script files →',
  REFS: 'Reference documents:',
  REF_SCRIPTS: 'Reference scripts (copies):',
  SKILLS_READONLY: 'Skill copies (read-only):',
  TERMINAL_WORKFLOW: 'Terminal workflow (mandatory):',
  RULE_EXEC_FILE:
    '- Use `run_script` or `run_script_file` only: execFile(interpreter, script file path, …args) — never raw shell one-liners or pipes via tools.',
  RULE_NEW_SCRIPT:
    '- New work: use `run_script` with `scriptContent` (+ `scriptType` bash/python/javascript) so the tool writes under the **active tool-loop step** scripts dir shown below (or `output/scripts/` when no step scope) and runs that file in one step. Even one-line commands (e.g. `uptime`) go inside `scriptContent` as a bash script.',
  RULE_REFERENCED_SCRIPTS:
    '- If your new script depends on existing reference scripts from `<sandbox>/scripts`, pass them via `referencedScriptFiles`; the tool reads those files and prepends their contents before your `scriptContent` in the internal generated file.',
  RULE_EXISTING_SCRIPT:
    '- Run a pre-existing script: `run_script_file` with `scripts/foo.sh` (planning copies under `<sandbox>/scripts`) or a path under the step `scripts/` dir. The interpreter still receives an absolute script path; cwd is the step folder when scoped.',
  RULE_CAPTURES:
    '- Captures live under the step `results/` dir. Set `resultFileRelativePath` for the main deliverable; the tool scans the whole step folder (except `scripts/`) for new/changed files and returns `artifacts[]`. Scripts are syntax-checked before execution (preflight).',
  RULE_CWD:
    '- When a tool-loop step is active, `run_script` / `run_script_file` cwd is that step dir (`output/toolLoop/<step>/`). Write generated outputs under `./results/` or `results/scratch/`; only `scripts/` is excluded from deliverable discovery. Read workspace files via `OTTER_WORKSPACE_PATH` or workspace paths in `scriptArgs`. Use `promote_artifact` for intentional workspace deliverables. Env: `OTTER_SANDBOX_ROOT`, `OTTER_STEP_CWD`, `OTTER_RESULTS_DIR`, `OTTER_REFERENCE_SCRIPTS_DIR`, `OTTER_WORKSPACE_PATH` (when workspace set).',
  RULE_READONLY:
    '- Treat skills/, refs/, and reference scripts/ as read-only unless copying out.',
} as const

export type SandboxStructureLayout = {
  root: string
  outputDir: string
  resultsDir: string
  /** Where `run_script` writes new files (scoped per tool-loop step when active). */
  scriptsDir: string
  /** Planning copies of reference scripts (`<sandbox>/scripts`); defaults to {@link scriptsDir}. */
  referenceScriptsDir?: string
  refsDir: string
  skillsDir: string
  toolLoopScope?: string
  toolLoopOutputRelDir?: string
}

export function buildSandboxStructureBlock(layout: SandboxStructureLayout): string {
  const referenceScriptsDir = layout.referenceScriptsDir ?? layout.scriptsDir
  const scopeLines =
    layout.toolLoopScope && layout.toolLoopOutputRelDir
      ? [
          `Active tool-loop step scope: ${layout.toolLoopScope}`,
          `Write this step's artifacts only under: ${layout.toolLoopOutputRelDir}/`,
          `run_script cwd: ${layout.toolLoopOutputRelDir}/ (deliverables in ./results/; reference scripts still under ${referenceScriptsDir})`,
        ]
      : []

  return [
    SANDBOX_LLM.HEADER,
    SANDBOX_LLM.ROOT_LABEL,
    `  ${layout.root}`,
    ...scopeLines,
    `${SANDBOX_LLM.OUTPUT_DIR} ${layout.outputDir}`,
    `${SANDBOX_LLM.CAPTURES} ${layout.resultsDir}`,
    `${SANDBOX_LLM.SCRIPTS} ${layout.scriptsDir} (new files written here)`,
    `${SANDBOX_LLM.REFS} ${layout.refsDir}`,
    `${SANDBOX_LLM.REF_SCRIPTS} ${referenceScriptsDir}`,
    `${SANDBOX_LLM.SKILLS_READONLY} ${layout.skillsDir}`,
    '',
    SANDBOX_LLM.TERMINAL_WORKFLOW,
    SANDBOX_LLM.RULE_EXEC_FILE,
    SANDBOX_LLM.RULE_NEW_SCRIPT,
    SANDBOX_LLM.RULE_REFERENCED_SCRIPTS,
    SANDBOX_LLM.RULE_EXISTING_SCRIPT,
    SANDBOX_LLM.RULE_CAPTURES,
    SANDBOX_LLM.RULE_CWD,
    SANDBOX_LLM.RULE_READONLY,
    SANDBOX_LLM.FOOTER,
  ].join('\n')
}

export function buildWorkspaceStructureBlock(
  workspacePath?: string | null,
): string {
  if (workspacePath?.trim()) {
    return [
      '=== USER WORKSPACE ===',
      '- File tools: default target = project folder below; only paths starting with output/, scripts/, refs/, or skills/ use the sandbox root above.',
      `Project folder: ${workspacePath.trim()}`,
      '- Edit the user project with read_file, edit_file, write_file, apply_patch, delete_file.',
      '- Relative paths like src/index.ts or . resolve here by default.',
      '- Absolute paths under this project folder also work (call read_file — do not claim you lack filesystem access).',
      '- If the user pastes a full path under this folder, use read_file on that path or the equivalent relative path.',
      '- Use output/, scripts/, refs/, or skills/ only for sandbox artifacts — not the user repo.',
      '- Do NOT write agent runtime artifacts (captures, tool output, script temp files) into this folder — scripts run in the sandbox step and may only read from here.',
      '- Scripts: read project data via OTTER_WORKSPACE_PATH or path-like scriptArgs; write outputs in sandbox results/ then promote_artifact when needed.',
      '- Use lsp for symbol navigation (definition, references, hover) in project files.',
      '- After edits, verify with run_workspace_command (e.g. npm test) when appropriate.',
      '- Git: git_status / git_diff / git_log / git_add / git_commit / git_push / git_create_pr (not run_script for git).',
      '=== END USER WORKSPACE ===',
    ].join('\n')
  }

  return [
    '=== USER WORKSPACE (not set) ===',
    '=== END USER WORKSPACE ===',
  ].join('\n')
}

export function buildSandboxInstructionBlock(
  layout: SandboxStructureLayout & {
    workspacePath?: string | null
  },
): string {
  const sandbox = buildSandboxStructureBlock(layout)
  const workspace = buildWorkspaceStructureBlock(layout.workspacePath)
  return `${sandbox}\n\n${workspace}`
}
