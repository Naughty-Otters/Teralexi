import type { SkillTool } from './types'
import type { SkillComposerToolbarPlugin } from './composer-toolbar-plugin'
import { tools as documentsActionTools } from '../../../skills/documents/actions/index'
import { tools as researchActionTools } from '../../../skills/research/actions/index'
import { tools as googleWorkspaceActionTools } from '../../../skills/google-workspace/actions/index'
import {
  tools as websiteActionTools,
  composerToolbarPlugins as websiteComposerToolbarPlugins,
} from '../../../skills/website/actions/index'

const BUNDLED_ACTION_TOOLS: Record<string, readonly SkillTool[]> = {
  documents: documentsActionTools,
  research: researchActionTools,
  'google-workspace': googleWorkspaceActionTools,
  website: websiteActionTools,
}

const BUNDLED_COMPOSER_TOOLBAR_PLUGINS: Record<
  string,
  readonly SkillComposerToolbarPlugin[]
> = {
  website: websiteComposerToolbarPlugins,
}

export function getBundledSkillActionTools(
  skillId: string,
  declaredToolNames: string[] = [],
): SkillTool[] {
  const tools = [...(BUNDLED_ACTION_TOOLS[skillId] ?? [])]
  if (declaredToolNames.length === 0) return tools
  const allowed = new Set(declaredToolNames)
  return tools.filter((tool) => allowed.has(tool.name))
}

export function getBundledSkillComposerToolbarPlugins(
  skillId: string,
): SkillComposerToolbarPlugin[] {
  return [...(BUNDLED_COMPOSER_TOOLBAR_PLUGINS[skillId] ?? [])]
}

export function verifyBundledSkillActions(): void {
  for (const [skillId, tools] of Object.entries(BUNDLED_ACTION_TOOLS)) {
    if (tools.length === 0) {
      throw new Error(`bundled skill ${skillId} has no statically imported actions`)
    }
  }
}
