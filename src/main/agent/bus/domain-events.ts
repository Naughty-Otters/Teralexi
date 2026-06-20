export type AgentDomainEvent =
  | { type: 'agent.llm.text.delta'; delta: string }
  | {
      type: 'agent.llm.tool.updated'
      toolCallId: string
      name: string
      status: 'pending' | 'running' | 'completed' | 'error'
    }
  | { type: 'agent.llm.step.progress'; chunk: string }
  | {
      type: 'agent.llm.finish'
      usage?: {
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
      }
      reason?: string
    }

export type AgentDomainEventType = AgentDomainEvent['type']

export function isAgentDomainEvent(value: unknown): value is AgentDomainEvent {
  if (!value || typeof value !== 'object') return false
  const t = (value as { type?: unknown }).type
  return (
    t === 'agent.llm.text.delta' ||
    t === 'agent.llm.tool.updated' ||
    t === 'agent.llm.step.progress' ||
    t === 'agent.llm.finish'
  )
}
