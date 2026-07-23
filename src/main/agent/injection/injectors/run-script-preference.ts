import { RUN_SCRIPT_TOOLS } from '@shared/constants'
import { DIAGRAM_NO_RUN_SCRIPT_RULE } from '@shared/agent/diagram-output-instructions'
import type { AgentInjector } from '../types'
import type { RuntimeToolMeta } from '../../types'
import { INJECTOR_ORDER } from './orders'

const RUN_SCRIPT_SECTION = {
  TITLE: '### Prefer sandbox script tools (`run_script` / `run_script_file`)',
  WHEN_TO_USE:
    'When the request can be satisfied by code running in the agent sandbox (read/write files under the sandbox, transform data, call subprocesses, host metrics like `uptime`, etc.), **choose `run_script` or `run_script_file` before other tools**, unless another tool is clearly the only fit. You have sandbox script access — do not claim you lack OS or uptime access; run a script instead.',
  CONTENT_BULLET:
    '- **`run_script`**: use for ad-hoc or one-off logic — required `scriptType` + `scriptContent`; optional `scriptArgs`, `captureRelativePath`, `referencedScriptFiles`.',
  FILE_BULLET:
    '- **`run_script_file`**: use when a script file already exists under `<sandbox>/scripts` — required `scriptType` + `scriptRelativePath`.',
  LANGUAGE_DEFAULT:
    '**Language:** For new `run_script` scripts, **default to Python** (`scriptType`: `python`) unless the task clearly needs bash or Node; then use `bash` or `javascript` / `nodejs`.',
  MCP_FALLBACK:
    'Reserve MCP or other tools for cases that cannot be done reasonably in the sandbox or are explicitly out of scope for scripting.',
  DIAGRAM_EXCEPTION: DIAGRAM_NO_RUN_SCRIPT_RULE,
} as const

const SHELL_SECTION = {
  TITLE: '### Prefer `shell` for workspace / project commands',
  WHEN_TO_USE:
    'When the user has a workspace folder and needs project commands (git, tests, rg/find, builds), **use `shell`** with an argv array. Do not invent `git_*` / `grep_files` tools.',
  ARGV:
    '- Pass `command` as a string or argv array; prefer argv. Keep commands short and task-focused.',
  NO_SOURCE_EDITS:
    '- **Do not** create or edit project source via shell redirects, `sed -i`, `tee`, or heredocs — use `edit_files` so the chat shows diffs.',
} as const

export function buildRunScriptPreferenceBlock(tools: RuntimeToolMeta[]): string {
  const hasRunScript = tools.some((t) => t.name === RUN_SCRIPT_TOOLS.CONTENT)
  const hasRunScriptFile = tools.some((t) => t.name === RUN_SCRIPT_TOOLS.FILE)
  if (!hasRunScript && !hasRunScriptFile) return ''

  const hasShell = tools.some((t) => t.name === 'shell')
  const lines: string[] = [
    RUN_SCRIPT_SECTION.TITLE,
    RUN_SCRIPT_SECTION.WHEN_TO_USE,
  ]
  if (hasRunScript) lines.push(RUN_SCRIPT_SECTION.CONTENT_BULLET)
  if (hasRunScriptFile) lines.push(RUN_SCRIPT_SECTION.FILE_BULLET)
  lines.push(RUN_SCRIPT_SECTION.LANGUAGE_DEFAULT)
  if (hasShell) {
    lines.push(
      'For **workspace/project** commands (git, tests, rg), prefer the `shell` tool instead of wrapping everything in `run_script`.',
      SHELL_SECTION.NO_SOURCE_EDITS,
    )
  } else {
    lines.push(
      'Never pass raw shell one-liners through non-script tools; wrap shell in `run_script` with `scriptType` `bash` if you must use the shell.',
    )
  }
  lines.push(
    RUN_SCRIPT_SECTION.DIAGRAM_EXCEPTION,
    RUN_SCRIPT_SECTION.MCP_FALLBACK,
  )
  return lines.join('\n')
}

export function buildShellPreferenceBlock(tools: RuntimeToolMeta[]): string {
  const hasShell = tools.some((t) => t.name === 'shell')
  if (!hasShell) return ''
  // When run_script guidance is also present, shell tips are folded into that block.
  const hasRunScript = tools.some(
    (t) =>
      t.name === RUN_SCRIPT_TOOLS.CONTENT || t.name === RUN_SCRIPT_TOOLS.FILE,
  )
  if (hasRunScript) return ''

  return [
    SHELL_SECTION.TITLE,
    SHELL_SECTION.WHEN_TO_USE,
    SHELL_SECTION.ARGV,
    SHELL_SECTION.NO_SOURCE_EDITS,
  ].join('\n')
}

export const runScriptPreferenceInjector: AgentInjector = {
  id: 'run-script-preference',
  order: INJECTOR_ORDER.RUN_SCRIPT_PREFERENCE,
  applies({ profile, tools }) {
    return (
      profile.stage === 'toolLoop' &&
      (buildRunScriptPreferenceBlock(tools).length > 0 ||
        buildShellPreferenceBlock(tools).length > 0)
    )
  },
  injectInstructions({ tools }) {
    const blocks = [
      buildRunScriptPreferenceBlock(tools),
      buildShellPreferenceBlock(tools),
    ].filter(Boolean)
    return blocks.length > 0 ? blocks.join('\n\n') : null
  },
}
