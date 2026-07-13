/**
 * toolSet – shared tool library
 *
 * All tools exported here are automatically injected into every skill by the
 * skill loader. Skills do not need their own actions/ folder to access these.
 * Skill-specific tools (e.g. GitHub, Google Workspace) live under `skills/<id>/actions/`.
 */

import type { SkillTool, SkillToolModule } from '@main/skills/actions'

export * from './file-system'
export * from './shell-command'
export * from './git'
export * from './todos'
export * from './generate-follow-up'
export * from './lsp'
export * from './web'
export * from './deep-research'
export * from './openalex-scholar-search'
export * from './scholar-courts'
export * from './google-scholar-search'
export * from './planning-tools'
export * from './sub-agent-tools'

import {
  listFiles,
  searchFiles,
  fileStatus,
  storageCheck,
  moveFile,
  copyFile,
  writeFile,
  readFile,
  editFile,
  grepFiles,
  globFiles,
  applyPatch,
  deleteFile,
  runWorkspaceCommand,
  promoteArtifact,
} from './file-system'
import { runScript, runScriptFile } from './shell-command'
import { gitTools } from './git'
import { todoTools } from './todos'
import { followUpTools } from './generate-follow-up'
import { planningTools } from './planning-tools'
import { subAgentTools } from './sub-agent-tools'
import { lspTools } from './lsp'
import { deepResearch } from './deep-research'
import { webScrape, webSearch } from './web'

export const tools: SkillTool[] = [
  listFiles,
  searchFiles,
  fileStatus,
  storageCheck,
  moveFile,
  copyFile,
  readFile,
  writeFile,
  editFile,
  grepFiles,
  globFiles,
  applyPatch,
  deleteFile,
  runWorkspaceCommand,
  promoteArtifact,
  runScript,
  runScriptFile,
  ...gitTools,
  ...todoTools,
  ...followUpTools,
  ...planningTools,
  ...subAgentTools,
  ...lspTools,
  webSearch,
  webScrape,
  deepResearch,
]

export default { tools } satisfies SkillToolModule
