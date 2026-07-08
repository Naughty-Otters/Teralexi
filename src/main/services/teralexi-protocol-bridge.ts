export type TeralexiProtocolDispatch = (rawUrl: string) => Promise<void>

export type TeralexiProtocolBridge = {
  ready: boolean
  pendingUrls: string[]
  dispatchUrl: TeralexiProtocolDispatch | null
}

const BRIDGE_KEY = '__teralexiProtocolBridge'

/** Shared between bootstrap.js and main-app.js (separate Rollup bundles). */
export function getTeralexiProtocolBridge(): TeralexiProtocolBridge {
  const root = globalThis as Record<string, TeralexiProtocolBridge | undefined>
  if (!root[BRIDGE_KEY]) {
    root[BRIDGE_KEY] = {
      ready: false,
      pendingUrls: [],
      dispatchUrl: null,
    }
  }
  return root[BRIDGE_KEY]!
}
