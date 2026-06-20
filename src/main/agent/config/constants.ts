/** Non-LLM constants for the agent package (errors, log messages, defaults). */

export const AGENT_DEFAULTS = {
  USER_ID: 'default',
  RESPONSE_LANGUAGE: 'English',
} as const

export const AGENT_ERRORS = {
  NOT_FOUND: 'Agent not found: {agentId}',
} as const

export const ENGINE_LOG = {
  PERSIST_USER_OK: 'Persisted incoming user message on main process',
  PERSIST_USER_FAIL: 'Failed to persist incoming user message',
  PERSIST_SANDBOX_FAIL: 'Failed to persist sandbox run',
  STOP_REQUESTED: 'Stop requested for in-flight agent execution',
  ABORTED: 'Agent execution aborted',
  EXECUTION_ABORTED: 'Agent execution aborted because agent was not found',
  PREPARED_CONTEXT: 'Prepared execution context',
  COMPLETED: 'Agent execution completed',
  FAILED: 'Agent execution failed',
  PERSIST_ASSISTANT_OK: 'Persisted assistant message after execution',
  PERSIST_ASSISTANT_FAIL: 'Failed to persist assistant message after execution',
  MEMORY_RECORD_ENQUEUED: 'Enqueued agent memory abstraction',
  MEMORY_RECORD_OK: 'Recorded agent memory exchange',
  MEMORY_RECORD_FAIL: 'Failed to record agent memory exchange',
  SANDBOX_READY: 'Sandbox ready for agent execution',
  SANDBOX_RESULT: 'Sandbox result written for agent execution',
} as const
