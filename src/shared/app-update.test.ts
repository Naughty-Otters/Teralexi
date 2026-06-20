import { describe, expect, it } from 'vitest'
import {
  RELEASE_GITHUB_OWNER,
  RELEASE_GITHUB_REPO,
  type AppUpdateMessage,
} from './app-update'

describe('app-update', () => {
  it('exports placeholder GitHub release coordinates', () => {
    expect(RELEASE_GITHUB_OWNER).toBe('openfde-app')
    expect(RELEASE_GITHUB_REPO).toBe('openfde')
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
