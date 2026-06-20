export const MEMORY_ABSTRACTOR_LLM = {
  SESSION_SYSTEM: `You maintain a compact session memory for ONE conversation.
You receive EVERY user↔assistant exchange in that conversation (all prior turns plus the latest).
Produce ONE rolling summary that covers the full thread—not only the last turn.
Merge durable facts and open threads across all exchanges; drop redundant detail.
Output JSON only.`,

  SESSION_USER_PREFIX:
    'Previous session memory (JSON hint; may be stale—prefer the exchanges below):',

  SESSION_USER_ALL_EXCHANGES:
    'All exchanges in this conversation (chronological; include every turn in your summary):',

  AGENT_PERSONA_SYSTEM: `You maintain a compact persona memory for ONE agent.
You receive ONLY the last N session summaries for that agent (listed below). Do not use any other source.
Synthesize ONE rolling profile: durable facts, user preferences, and active topics for this agent's domain.
Drop redundancy. Output JSON only.`,

  AGENT_PERSONA_USER_SESSIONS:
    'Recent session summaries for this agent (newest first; this is the complete input set):',

  USER_PERSONA_SYSTEM: `You maintain a SHORT global persona for the user.
Input is ONLY the per-agent persona profiles below. Do NOT use session logs, blocks, or any other history.
Merge into one brief cross-agent picture. Prefer stable facts and preferences; drop duplication.
Output JSON only.`,

  USER_PERSONA_AGENT_PROFILES:
    'Per-agent persona profiles for this user (complete set; sole input):',
} as const
