import type { SkillCompiledArtifact } from './skill-compiled-schema'
import type { SkillCompilationStatus } from './skill-compiled-schema'
import type {
  ExecutionSteps,
  SkillColor,
  SkillProperties,
  SkillProvider,
  SkillSections,
  SkillTool,
} from './types'

export interface SkillDefinition {
  /** Folder name – used as stable id */
  id: string
  /** Absolute path to the skill folder */
  folder: string
  properties: SkillProperties
  sections: SkillSections
  /** Compiled system prompt ready to inject into the model */
  systemPrompt: string
  /**
   * Resolved tool implementations (global toolSet + skill `actions/`).
   * Used for agent AvailableSet configuration and runtime tool metadata.
   * Names listed in `sections.tools` are what the skill documents in skill.md.
   */
  tools: SkillTool[]
  /** Tool names loaded from this skill's `actions/` folder (not global toolSet). */
  actionToolNames: string[]
  /** LLM-compiled artifact when compilation succeeded on load. */
  compiledArtifact?: SkillCompiledArtifact
  compilationStatus?: SkillCompilationStatus | 'missing'
}

export interface SkillAgent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  color: SkillColor
  enabled: boolean
  provider: SkillProvider
  isSkill: true
  skillId: string
  skillsPrompt?: string
  executionSteps?: ExecutionSteps<
    Omit<SkillTool, 'execute' | 'inputSchema'> & { inputSchema?: unknown }
  >
  /** Default enabled tools from properties.md `allowed_tools` (before user overrides). */
  allowedTools?: string[]
  /** Names from `actions/` — always enabled by default with `allowed_tools`. */
  actionToolNames?: string[]
  /** Skill family metadata from properties.md `group` / `variant` fields. */
  skillGroup?: string
  skillGroupLabel?: string
  skillVariant?: string
  skillVariantLabel?: string
  skillGroupOrder?: number
  skillVariantOrder?: number
  skillGroupPrimary?: boolean
  compiledArtifact?: SkillCompiledArtifact
  compilationStatus?: SkillCompilationStatus | 'missing'
}
