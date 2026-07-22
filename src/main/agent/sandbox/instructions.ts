/** LLM-facing sandbox workspace instructions injected into executor prompts. */

export const SANDBOX_LLM = {
  HEADER: '=== SANDBOX ===',
  FOOTER: '=== END SANDBOX ===',
  ROOT_LABEL:
    'SANDBOX ROOT (📦) — tool paths resolve from here; shell cwd is the workspace (or OS shell when use_shell is set):',
  OUTPUT_DIR: 'Output directory (artifacts):',
  CAPTURES: '  Captures / results →',
  SCRIPTS: '  Scripts / references →',
  REFS: 'Reference documents:',
  REF_SCRIPTS: 'Reference scripts (copies):',
  SKILLS_READONLY: 'Skill copies (read-only):',
  TERMINAL_WORKFLOW: 'Terminal workflow (mandatory):',
  RULE_EXEC_FILE:
    '- Use `shell` for commands (argv or string). Prefer workspace shell; set `use_shell: true` only when an OS login shell is required.',
  RULE_NEW_SCRIPT:
    '- Prefer writing a short script under the sandbox/workspace with `edit_files`, then run it via `shell` (node / python3 / bash).',
  RULE_REFERENCED_SCRIPTS:
    '- Reference scripts under `<sandbox>/scripts` can be invoked with `shell` using absolute or sandbox-relative paths.',
  RULE_EXISTING_SCRIPT:
    '- Run an existing script with `shell` (e.g. `bash scripts/foo.sh` or `node scripts/foo.mjs`).',
  RULE_CAPTURES:
    '- Prefer writing outputs under the sandbox `output/` / step `results/` dirs; use `promote_artifact` for intentional workspace deliverables.',
  RULE_CWD:
    '- `shell` defaults to the user workspace when set. Read workspace files via paths or `TERALEXI_WORKSPACE_PATH`. Env may include `TERALEXI_SANDBOX_ROOT`, `TERALEXI_STEP_CWD`, `TERALEXI_RESULTS_DIR`, `TERALEXI_REFERENCE_SCRIPTS_DIR`, `TERALEXI_WORKSPACE_PATH`.',
  RULE_READONLY:
    '- Treat skills/, refs/, and reference scripts/ as read-only unless copying out.',
} as const

export type SandboxStructureLayout = {
  root: string
  outputDir: string
  resultsDir: string
  /** Script / reference materialization directory (scoped per tool-loop step when active). */
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
          `Step artifact dir: ${layout.toolLoopOutputRelDir}/ (deliverables in ./results/; reference scripts still under ${referenceScriptsDir})`,
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
      '- Edit the user project with read_file and edit_files (modes: replace | write | delete | patch).',
      '- Relative paths like src/index.ts or . resolve here by default.',
      '- Absolute paths under this project folder also work (call read_file — do not claim you lack filesystem access).',
      '- If the user pastes a full path under this folder, use read_file on that path or the equivalent relative path.',
      '- Use output/, scripts/, refs/, or skills/ only for sandbox artifacts — not the user repo.',
      '- Do NOT write agent runtime artifacts into this folder unless the user asked — prefer sandbox results/ then promote_artifact.',
      '- Use lsp for symbol navigation (definition, references, hover) in project files.',
      '- After edits, verify with shell (e.g. npm test) when appropriate.',
      '- Git / search: use shell (git status|diff|log, rg, find) — there are no dedicated git_* or grep_files tools.',
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
