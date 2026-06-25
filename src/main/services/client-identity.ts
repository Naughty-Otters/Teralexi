import { randomUUID } from 'node:crypto'
import { getSystemPropValue, setSystemPropValue } from '@config/system-prop'
import { createLogger } from '@main/logger'

const log = createLogger('services.client-identity')

export const CLIENT_ID_PROP_KEY = 'app.client.id'

/** Stable install-scoped client id persisted in config.properties. */
export function ensureClientId(): string {
  const existing = getSystemPropValue(CLIENT_ID_PROP_KEY, '').trim()
  if (existing) return existing

  const clientId = randomUUID()
  setSystemPropValue(CLIENT_ID_PROP_KEY, clientId)
  log.info('Generated client id', { clientId })
  return clientId
}

export function getClientId(): string {
  return getSystemPropValue(CLIENT_ID_PROP_KEY, '').trim()
}
