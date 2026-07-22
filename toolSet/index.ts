/**
 * toolSet – shared tool library (lean catalog + sandbox scripts).
 *
 * Skill-specific tools live under `skills/<id>/actions/`.
 */

import type { SkillTool, SkillToolModule } from '@main/skills/actions'

export * from './file-system'
export * from './shell-command'
export * from './todos'
export * from './generate-follow-up'
export * from './lsp'
export * from './web'
export * from './planning-tools'
export * from './sub-agent-tools'
/** Scholar helpers for the research step pipeline (not catalog tools). */
export * from './openalex-scholar-search'
export * from './scholar-courts'
export * from './google-scholar-search'

import { readFile, editFiles, shell, promoteArtifact } from './file-system'
import { runScript, runScriptFile } from './shell-command'
import { todoTools } from './todos'
import { followUpTools } from './generate-follow-up'
import { planningTools } from './planning-tools'
import { subAgentTools } from './sub-agent-tools'
import { lspTools } from './lsp'
import { webScrape, webSearch } from './web'

export const tools: SkillTool[] = [
  readFile,
  editFiles,
  shell,
  promoteArtifact,
  runScript,
  runScriptFile,
  ...todoTools,
  ...followUpTools,
  ...planningTools,
  ...subAgentTools,
  ...lspTools,
  webSearch,
  webScrape,
]

export default { tools } satisfies SkillToolModule
