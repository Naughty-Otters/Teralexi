// ── Primitive value types ─────────────────────────────────────────────────

export type SkillColor =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'neutral'

import type { SkillProvider } from '@shared/agent/llm-provider-registry'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'

export type { SkillProvider }

export type SkillToolOs = 'mac' | 'linux' | 'win'

/** Where a skill appears in the product UI. Default: chat agent picker and settings. */
export type SkillVisibility = 'chat' | 'workflow'

// ── Properties (frontmatter) ──────────────────────────────────────────────

/**
 * Structured metadata declared in the `---` frontmatter block of a skill.md.
 *
 * skill.md frontmatter example:
 * ---
 * name: My Skill
 * description: What this skill does
 * model: llama3.2
 * provider: ollama | llamacpp | openai | ...
 * color: primary
 * enabled: true
 * ---
 */
export interface SkillProperties {
  /** Human-readable display name */
  name: string
  /** Short summary shown in the UI */
  description: string
  /** Model identifier passed to the provider (e.g. "gpt-4o", "claude-sonnet-4-6") */
  model: string
  /** Inference provider to route the request to */
  provider: SkillProvider
  /** UI accent color for the skill card */
  color: SkillColor
  /** Whether the skill is available for selection */
  enabled: boolean
  /**
   * UI scope: `chat` (default) — agent picker and settings;
   * `workflow` — workflow panel only.
   */
  visibility?: SkillVisibility
  /** Comma-separated skill-relative folders for reference docs (default `refs`) */
  refs_dir?: string
  /** Comma-separated skill-relative folders for scripts (default `scripts`) */
  scripts_dir?: string
  /** Comma-separated skill-relative folders for form specs (default `form`) */
  form_dir?: string
  /**
   * Comma-separated tool names enabled by default when the user has not
   * customized AvailableSet (`allowed_tools` in properties.md).
   */
  allowedTools?: string[]
  /**
   * Per-skill tool-loop step budget (`max_iterations` in properties.md).
   * Coding-oriented skills should set this high (e.g. 50). Clamped to
   * [MIN, MAX]_TOOL_LOOP_MAX_ITERATIONS. Falls back to the default when unset.
   */
  maxIterations?: number
  /** Skill family id for grouped UI (e.g. `coding`). From `group` in properties.md. */
  skillGroup?: string
  /** Human label for the family (e.g. `Coding`). From `group_label`. */
  skillGroupLabel?: string
  /** Variant key within the group (e.g. `review`). From `variant`. */
  skillVariant?: string
  /** Human label for the variant (e.g. `Review`). From `variant_label`. */
  skillVariantLabel?: string
  /** Sort order for group sections in the agent picker. From `group_order`. */
  skillGroupOrder?: number
  /** Sort order within a group. From `variant_order`. */
  skillVariantOrder?: number
  /** Primary/default variant when picking the group. From `group_primary`. */
  skillGroupPrimary?: boolean
  /**
   * config.properties keys + form metadata from properties.md (`system_properties`
   * and `system_property.<key>.*` lines). Persisted under ~/.teralexi/config/.
   */
  systemProperties?: SkillSystemPropertySpec[]
}

// ── Constraints ───────────────────────────────────────────────────────────

/** Severity level attached to a constraint violation */
export type ConstraintSeverity = 'error' | 'warn' | 'info'

/**
 * A single behaviour constraint expressed as a typed condition expression.
 *
 * skill.md Constraints section example:
 * ## Constraints
 * - condition: never suggest destructive shell commands without warning
 *   message: Destructive commands must include an explicit safety warning
 *   severity: error
 *
 * Simple bullet strings are also accepted during parsing and promoted to
 * `{ expression, message: expression, severity: 'error' }`.
 */
export interface SkillConstraint {
  /**
   * Natural-language predicate that must hold during every response.
   * Think of it as the "if violated" condition the model must avoid.
   */
  expression: string
  /** Human-readable explanation surfaced when the constraint is applied */
  message: string
  /** How seriously the model should treat a violation */
  severity: ConstraintSeverity
}

// ── GuardRails (Validation) ───────────────────────────────────────────────

/** Action to take when a guardrail rule is triggered */
export type GuardRailAction = 'refuse' | 'warn' | 'flag'

/**
 * A validation rule that governs what the skill must never produce.
 *
 * skill.md GuardRails section example:
 * ## GuardRails
 * - rule: Do not write malware or exploit code
 *   action: refuse
 *   message: This request violates the skill's safety policy
 *
 * Simple bullet strings are also accepted during parsing and promoted to
 * `{ rule, action: 'refuse', message: rule }`.
 */
export interface SkillGuardRail {
  /** Declarative description of what the rule prohibits or requires */
  rule: string
  /** How the skill responds when the rule fires */
  action: GuardRailAction
  /** Optional message shown to the user when the guardrail triggers */
  message?: string
}

// ── Composite section types ───────────────────────────────────────────────

export interface SkillExample {
  user: string
  assistant: string
}

export interface SkillSections {
  /** Full skill.md body (after frontmatter strip) — used as agent tool-loop instructions. */
  fullMarkdown: string
  instructions: string
  /** Summary step instructions (goal, plan, execution → report input). */
  summary: string
  report: string
  examples: SkillExample[]
  tools: string[]
}

// ── Tool definitions ──────────────────────────────────────────────────────

/**
 * A callable tool that a skill can invoke during agentic execution.
 * All tools exported from an `actions/index.ts` must conform to this shape.
 */
export interface SkillTool {
  /** Unique identifier used to reference the tool from skill.md's ## Tools section */
  name: string
  /** Grouping labels for UI organization/filtering (defaults to module name) */
  tags?: string[]
  /** Human-readable description of what the tool does */
  description: string
  /** Zod schema describing the expected tool input shape */
  inputSchema?: import('zod').ZodTypeAny
  /** Runtime OS injected into the action prompt so command generation targets the host system */
  os?: SkillToolOs
  /** Whether this tool requires a user approval step before execution */
  needsApproval?: boolean
  /**
   * Execute the tool.
   * @param input  - arbitrary key/value arguments provided by the model
   * @returns resolved output value forwarded back to the model
   */
  execute: (input: Record<string, unknown>) => Promise<unknown>
}

// ── Execution configuration ────────────────────────────────────────────────

/**
 * Configuration for multi-step agentic execution.
 * Steps execute in order: 1) thinking (before planning when planning is enabled),
 * 2) planning, 3) tools ({@link Agent}), 4) skills, 5) summary, 6) report.
 * If a step is not specified, it is skipped.
 */
export interface ExecutionSteps<TTool = SkillTool> {
  /**
   * Optional extra instructions for the Thinking step (runs before planning when
   * `planning` is set). Core behavior is built-in.
   */
  thinking?: string
  /** Planning/reasoning step instruction */
  planning?: string
  /**
   * Agent step – runs the listed tools in a loop until the model
   * produces a final answer or `maxIterations` is reached.
   * Omitted (or empty tools array) → step is bypassed automatically.
   */
  toolLoop?: {
    /** Resolved tool implementations available in this execution */
    tools: TTool[]
    /** Maximum number of tool-call iterations before forcing a final answer (default: 40) */
    maxIterations?: number
    /** When true, exposes the `invoke_agents` tool to run nested agent pipelines. */
    allowSubAgents?: boolean
    /** Optional allow-list of catalog agent ids for `invoke_agents`. */
    subAgentIds?: string[]
  }
  /** Declarative sub-agent stages (see {@link AgentFlow.subFlow}). */
  subFlows?: Array<{ agentId: string }>
  /** Main task execution step instruction */
  skills?: string
  /** Summary step instructions (goal, plan, execution for reporting) */
  summary?: string
  /** Report step instructions for summarizing final actions and results */
  report?: string
}
