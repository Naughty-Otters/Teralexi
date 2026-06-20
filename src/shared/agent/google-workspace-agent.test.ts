import { describe, expect, it } from 'vitest'
import {
  agentIsGoogleWorkspaceAgent,
  googleWorkspaceComposerHint,
  skillIsGoogleWorkspaceAgent,
} from './google-workspace-agent'

describe('google-workspace-agent', () => {
  it('detects google-workspace skill', () => {
    expect(skillIsGoogleWorkspaceAgent('google-workspace')).toBe(true)
    expect(skillIsGoogleWorkspaceAgent('coding')).toBe(false)
    expect(agentIsGoogleWorkspaceAgent({ id: 'skill:google-workspace' })).toBe(
      true,
    )
    expect(agentIsGoogleWorkspaceAgent({ skillId: 'research', id: 'x' })).toBe(
      false,
    )
  })

  it('googleWorkspaceComposerHint warns when not signed in', () => {
    expect(
      googleWorkspaceComposerHint({
        agentIsGoogleWorkspace: true,
        isSignedIn: false,
        hasWorkspaceAccess: false,
      }),
    ).toMatch(/Sign in with Google/)
    expect(
      googleWorkspaceComposerHint({
        agentIsGoogleWorkspace: false,
        isSignedIn: false,
        hasWorkspaceAccess: false,
      }),
    ).toBeNull()
  })

  it('googleWorkspaceComposerHint warns when scopes are missing', () => {
    expect(
      googleWorkspaceComposerHint({
        agentIsGoogleWorkspace: true,
        isSignedIn: true,
        hasWorkspaceAccess: false,
      }),
    ).toMatch(/permissions are missing/)
  })
})
