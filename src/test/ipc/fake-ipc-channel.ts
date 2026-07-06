import { vi } from 'vitest'
import {
  IpcChannelMainClass,
  IpcChannelRendererClass,
} from '@ipcManager/index'
import { ONBOARDING_COMPLETED_KEY } from '@renderer/store/modules/agent/config'

export type IpcListener = (
  event: { sender?: unknown },
  payload?: unknown,
) => void

export type FakeIpcChannel = Record<string, unknown> & {
  emit: (channel: string, payload?: unknown) => void
  getListeners: (channel: string) => ReadonlySet<IpcListener>
  setInvokeHandler: (
    channel: string,
    handler: (args?: unknown) => unknown | Promise<unknown>,
  ) => void
}

const defaultInvokeHandlers: Record<
  string,
  (args?: unknown) => unknown | Promise<unknown>
> = {
  GetSystemConfigs: async () => ({
    [ONBOARDING_COMPLETED_KEY]: 'true',
  }),
  LoadSkills: async () => [],
  ListAgentConfigurations: async () => [],
  ListConversations: async () => [],
  GetConversationMessagesPage: async () => ({
    messages: [],
    hasMore: false,
  }),
  StopAgentForConversation: async () => undefined,
  RunAgentForConversation: async () => ({
    finalContent: 'Hello from the integration test agent.',
    hasError: false,
    hitlPaused: false,
  }),
}

function createRendererChannel(
  channel: string,
  listeners: Map<string, Set<IpcListener>>,
): Record<string, unknown> {
  return {
    on: (listener: IpcListener) => {
      let set = listeners.get(channel)
      if (!set) {
        set = new Set()
        listeners.set(channel, set)
      }
      set.add(listener)
      return () => set?.delete(listener)
    },
    once: (listener: IpcListener) => {
      const wrapped: IpcListener = (event, payload) => {
        listeners.get(channel)?.delete(wrapped)
        listener(event, payload)
      }
      let set = listeners.get(channel)
      if (!set) {
        set = new Set()
        listeners.set(channel, set)
      }
      set.add(wrapped)
      return () => set?.delete(wrapped)
    },
    removeListener: (listener: IpcListener) => {
      listeners.get(channel)?.delete(listener)
    },
    removeAllListeners: () => {
      listeners.delete(channel)
    },
  }
}

function createMainChannel(
  channel: string,
  invokeHandlers: Map<string, (args?: unknown) => unknown | Promise<unknown>>,
): Record<string, unknown> {
  return {
    invoke: vi.fn(async (args?: unknown) => {
      const handler = invokeHandlers.get(channel)
      if (handler) return handler(args)
      return undefined
    }),
  }
}

/** Mirrors preload `window.ipcRendererChannel` for renderer integration tests. */
export function createFakeIpcChannel(
  options: {
    invokeHandlers?: Record<
      string,
      (args?: unknown) => unknown | Promise<unknown>
    >
  } = {},
): FakeIpcChannel {
  const listeners = new Map<string, Set<IpcListener>>()
  const invokeHandlers = new Map<string, (args?: unknown) => unknown | Promise<unknown>>()

  for (const [channel, handler] of Object.entries(defaultInvokeHandlers)) {
    invokeHandlers.set(channel, handler)
  }
  for (const [channel, handler] of Object.entries(options.invokeHandlers ?? {})) {
    invokeHandlers.set(channel, handler)
  }

  const channelApi: FakeIpcChannel = {
    emit(channel, payload) {
      const event = { sender: {} }
      for (const listener of listeners.get(channel) ?? []) {
        listener(event, payload)
      }
    },
    getListeners(channel) {
      return listeners.get(channel) ?? new Set()
    },
    setInvokeHandler(channel, handler) {
      invokeHandlers.set(channel, handler)
      const entry = channelApi[channel] as { invoke?: ReturnType<typeof vi.fn> }
      if (entry?.invoke) {
        entry.invoke.mockImplementation(async (args?: unknown) => handler(args))
      }
    },
  }

  for (const channel of Object.keys(new IpcChannelMainClass())) {
    channelApi[channel] = createMainChannel(channel, invokeHandlers)
  }
  for (const channel of Object.keys(new IpcChannelRendererClass())) {
    channelApi[channel] = createRendererChannel(channel, listeners)
  }

  return channelApi
}

export function installFakeIpcChannel(
  channel: FakeIpcChannel = createFakeIpcChannel(),
): FakeIpcChannel {
  ;(globalThis as typeof globalThis & { ipcRendererChannel?: FakeIpcChannel }).ipcRendererChannel =
    channel
  if (typeof window !== 'undefined') {
    ;(window as typeof window & { ipcRendererChannel?: FakeIpcChannel }).ipcRendererChannel =
      channel
  }
  return channel
}

export function uninstallFakeIpcChannel(): void {
  delete (globalThis as typeof globalThis & { ipcRendererChannel?: FakeIpcChannel })
    .ipcRendererChannel
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { ipcRendererChannel?: FakeIpcChannel })
      .ipcRendererChannel
  }
}
