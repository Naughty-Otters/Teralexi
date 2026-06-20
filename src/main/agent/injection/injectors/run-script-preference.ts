import { RUN_SCRIPT_TOOLS } from '@shared/constants'
import type { AgentInjector, InjectionRunContext } from '../types'
import type { RuntimeToolMeta } from '../../types'
import { INJECTOR_ORDER } from './orders'

const RUN_SCRIPT_SECTION = {
  TITLE: '### Prefer sandbox script tools (`run_script` / `run_script_file`)',
  WHEN_TO_USE:
    'When the request can be satisfied by code running in the agent sandbox (read/write files under the sandbox, transform data, call subprocesses, host metrics like `uptime`, etc.), **choose `run_script` or `run_script_file` before other tools**, unless another tool is clearly the only fit. You have sandbox shell access — do not claim you lack OS or uptime access; run a bash script instead.',
  CONTENT_BULLET:
    '- **`run_script`**: use for ad-hoc or one-off logic — required `scriptType` + `scriptContent`; optional `scriptArgs`, `captureRelativePath`, `referencedScriptFiles`.',
  FILE_BULLET:
    '- **`run_script_file`**: use when a script file already exists under `<sandbox>/scripts` — required `scriptType` + `scriptRelativePath`.',
  LANGUAGE_DEFAULT:
    '**Language:** For new `run_script` scripts, **default to Python** (`scriptType`: `python`) unless the task clearly needs bash or Node; then use `bash` or `javascript` / `nodejs`.',
  NO_RAW_SHELL:
    'Never pass raw shell one-liners through non-script tools; wrap shell in `run_script` with `scriptType` `bash` if you must use the shell.',
  MCP_FALLBACK:
    'Reserve MCP or other tools for cases that cannot be done reasonably in the sandbox or are explicitly out of scope for scripting.',
} as const

export function buildRunScriptPreferenceBlock(tools: RuntimeToolMeta[]): string {
  const hasRunScript = tools.some((t) => t.name === RUN_SCRIPT_TOOLS.CONTENT)
  const hasRunScriptFile = tools.some((t) => t.name === RUN_SCRIPT_TOOLS.FILE)
  if (!hasRunScript && !hasRunScriptFile) return ''

  const lines: string[] = [
    RUN_SCRIPT_SECTION.TITLE,
    RUN_SCRIPT_SECTION.WHEN_TO_USE,
  ]
  if (hasRunScript) lines.push(RUN_SCRIPT_SECTION.CONTENT_BULLET)
  if (hasRunScriptFile) lines.push(RUN_SCRIPT_SECTION.FILE_BULLET)
  lines.push(
    RUN_SCRIPT_SECTION.LANGUAGE_DEFAULT,
    RUN_SCRIPT_SECTION.NO_RAW_SHELL,
    RUN_SCRIPT_SECTION.MCP_FALLBACK,
  )
  return lines.join('\n')
}

export const runScriptPreferenceInjector: AgentInjector = {
  id: 'run-script-preference',
  order: INJECTOR_ORDER.RUN_SCRIPT_PREFERENCE,
  applies({ profile, tools }) {
    return (
      profile.stage === 'toolLoop' &&
      buildRunScriptPreferenceBlock(tools).length > 0
    )
  },
  injectInstructions({ tools }) {
    const block = buildRunScriptPreferenceBlock(tools)
    return block || null
  },
}
