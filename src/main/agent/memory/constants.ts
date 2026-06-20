/** Global persona profile filename under `memory/users/<userId>/persona/`. */
export const AGENT_MEMORY_PERSONA_SNAPSHOT_FILE = 'profile.json'

/** Reserved top-level dirs under `memory/` (not agent ids). */
export const MEMORY_ROOT_RESERVED_DIR_NAMES = new Set(['users'])

/** Max characters of raw message text sent to the abstractor per role. */
export const MEMORY_ABSTRACTOR_MESSAGE_CHAR_LIMIT = 12_000

/** Fallback cap when the abstractor LLM call fails. */
export const MEMORY_FALLBACK_SUMMARY_CHAR_LIMIT = 8_000

/** Max JSON size for all session snapshots in the persona abstractor prompt. */
export const MEMORY_PERSONA_ALL_SESSIONS_CHAR_LIMIT = 48_000

/** Per-session summary cap inside the persona prompt payload. */
export const MEMORY_PERSONA_SESSION_SUMMARY_CHAR_LIMIT = 4_000

/** Max total characters of all block exchanges in one session abstractor prompt. */
export const MEMORY_SESSION_ALL_BLOCKS_CHAR_LIMIT = 40_000

/** Max JSON size for per-agent persona prompt (recent sessions only). */
export const MEMORY_AGENT_PERSONA_SESSIONS_CHAR_LIMIT = 24_000

/** Max JSON size when synthesizing global user persona from agent profiles only. */
export const MEMORY_USER_PERSONA_AGENTS_CHAR_LIMIT = 12_000

/** Target length for global user persona summary (fallback clip). */
export const MEMORY_USER_PERSONA_SUMMARY_CHAR_LIMIT = 2_000
