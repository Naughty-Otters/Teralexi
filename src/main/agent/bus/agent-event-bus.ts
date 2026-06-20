import type { AgentDomainEvent, AgentDomainEventType } from './domain-events'

type Listener = (event: AgentDomainEvent) => void

export class AgentEventBus {
  private readonly listeners = new Map<string, Set<Listener>>()

  subscribe(type: AgentDomainEventType | '*', listener: Listener): () => void {
    const key = type
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.listeners.delete(key)
    }
  }

  subscribeAll(listener: Listener): () => void {
    return this.subscribe('*', listener)
  }

  publish(event: AgentDomainEvent): void {
    const typed = this.listeners.get(event.type)
    if (typed) {
      for (const fn of typed) fn(event)
    }
    const wildcard = this.listeners.get('*')
    if (wildcard) {
      for (const fn of wildcard) fn(event)
    }
  }
}

export function createAgentEventBus(): AgentEventBus {
  return new AgentEventBus()
}
