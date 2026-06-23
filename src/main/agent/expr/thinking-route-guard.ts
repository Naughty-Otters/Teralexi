import type { NormalizedThinkingOutput } from '../utils/thinking-parse'

/** Minimal ctx slice for tool availability (matches {@link toolLoopStageShouldRun}). */
export type ThinkingRouteToolContext = {
  opts?: {
    skillId?: string
  }
  runtimeTools?: ReadonlyArray<{ source?: string }>
}

/** Imperative / execution verbs — user wants work done, not an essay. */
const ACTION_VERB_RE =
  /\b(fix|implement|add|create|update|delete|remove|refactor|rewrite|build|run|execute|deploy|install|configure|change|modify|patch|debug|migrate|rename|move|wire|set up|write|commit|push|merge|revert|undo|apply|enable|disable|resolve|address|correct|handle|complete|finish|ship|deliver|scaffold|generate code|make the|update the|edit the)\b/i

/** Common phrasing where the user delegates execution to the agent. */
const ACTION_PHRASE_RE =
  /\b(please (do|fix|implement|add|create|update|run|help)|go ahead|need you to|want you to|help me (to )?(fix|implement|add|create|build|write|run|change)|can you (fix|implement|add|create|update|run|write|build|change|refactor)|could you (fix|implement|add|create|update|run|write|build|refactor))\b/i

/** User explicitly asked for a plan before implementation. */
const PLANNING_SIGNAL_RE =
  /\b(plan( out)?|roadmap|break (this )?down|multi[- ]step|architect(ure)?|before (we )?implement|needs? (a )?plan|write a plan|create a plan|step[- ]by[- ]step plan)\b/i

/**
 * Pure informational questions — keep direct_answer when no execution verbs appear.
 * "How do I fix X?" is allowed to stay informational unless paired with action phrasing.
 */
const PURE_INFO_RE =
  /^(what (is|are)|why (is|are|do|does)|how does|how do (?!i fix|i implement|i add|i create|i run)|tell me about|explain\b|explain (the )?concept|describe (the )?difference|what'?s the difference)\b/i

/** Explain/plot/visualize requests answerable with markdown + ```diagram``` (no run_script). */
const INLINE_DIAGRAM_RE =
  /\b(explain|plot|graph|chart|visuali[sz]e|sketch|draw|show)\b/i

export function userMessageLooksInlineDiagramExplanation(
  userMessage: string,
): boolean {
  const text = userMessage.trim()
  if (!text) return false
  if (userMessageLooksActionable(text) || userMessageLooksLikePlanning(text)) {
    return false
  }
  return INLINE_DIAGRAM_RE.test(text) || PURE_INFO_RE.test(text)
}

export function userMessageLooksActionable(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false

  const hasAction = ACTION_VERB_RE.test(text) || ACTION_PHRASE_RE.test(text)
  if (!hasAction) return false

  if (
    PURE_INFO_RE.test(text) &&
    !ACTION_PHRASE_RE.test(text) &&
    !/\b(fix|implement|add|create|update|run|write|build|refactor|change)\b/i.test(text)
  ) {
    return false
  }

  return true
}

export function userMessageLooksLikePlanning(userMessage: string): boolean {
  return PLANNING_SIGNAL_RE.test(userMessage.trim())
}

/** True when the user is asking for concepts/explanations only — safe to keep direct_answer. */
export function userMessageLooksPurelyInformational(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  if (userMessageLooksActionable(text) || userMessageLooksLikePlanning(text)) {
    return false
  }
  return PURE_INFO_RE.test(text) || INLINE_DIAGRAM_RE.test(text)
}

/** Whether this agent can run the tool loop (skill tools or MCP). */
export function agentHasRunnableTools(ctx: ThinkingRouteToolContext): boolean {
  const tools = ctx.runtimeTools ?? []
  return (
    (Boolean(ctx.opts?.skillId) || tools.some((tool) => tool.source === 'mcp')) &&
    tools.length > 0
  )
}

export type CorrectMisroutedThinkingOptions = {
  /** When true, direct_answer is only kept for purely informational user messages. */
  toolsEnabled?: boolean
}

/**
 * Some models route explain/plot requests to agent_call and then run_script/matplotlib.
 * Downgrade to direct_answer so the thinking response can include a ```diagram``` fence.
 */
export function downgradeAgentCallForInlineDiagram(
  thinking: NormalizedThinkingOutput,
  userMessage: string,
): NormalizedThinkingOutput {
  const user = userMessage.trim()
  if (!user || thinking.execution_mode !== 'agent_call') {
    return thinking
  }
  if (!userMessageLooksInlineDiagramExplanation(user)) {
    return thinking
  }
  return {
    ...thinking,
    execution_mode: 'direct_answer',
    response: thinking.response?.trim() ? thinking.response : undefined,
  }
}

/**
 * Some models over-use direct_answer and skip tool loop / plan mode.
 * Upgrade the route when the latest user message clearly asks for execution,
 * or when tools are enabled and the message is not pure Q&A.
 */
export function correctMisroutedThinking(
  thinking: NormalizedThinkingOutput,
  userMessage: string,
  options?: CorrectMisroutedThinkingOptions,
): NormalizedThinkingOutput {
  const user = userMessage.trim()
  if (!user || thinking.execution_mode !== 'direct_answer') {
    return thinking
  }

  const wantsPlanning = userMessageLooksLikePlanning(user)
  const wantsAction = userMessageLooksActionable(user)
  if (wantsPlanning) {
    return {
      ...thinking,
      execution_mode: 'planning',
      response: undefined,
    }
  }

  if (wantsAction) {
    return {
      ...thinking,
      execution_mode: 'agent_call',
      response: undefined,
    }
  }

  if (
    options?.toolsEnabled &&
    !userMessageLooksPurelyInformational(user)
  ) {
    return {
      ...thinking,
      execution_mode: 'agent_call',
      response: undefined,
    }
  }

  return thinking
}
