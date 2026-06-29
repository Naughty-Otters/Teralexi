import { describe, expect, it } from 'vitest'
import {
  OPENFDE_DESKTOP_RELEASES_DEFAULT_PATH,
  type AppUpdateMessage,
} from './app-update'

describe('app-update', () => {
  it('exports desktop release feed default path', () => {
    expect(OPENFDE_DESKTOP_RELEASES_DEFAULT_PATH).toBe(
      'desktop/releases/stable',
    )
  })

  it('allows typed update messages', () => {
    const message: AppUpdateMessage = {
      phase: 'available',
      currentVersion: '0.0.1',
      newVersion: '0.0.2',
    }
    expect(message.phase).toBe('available')
  })
})
