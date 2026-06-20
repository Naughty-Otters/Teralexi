import { describe, expect, it } from 'vitest'
import {
  describeWorkspaceSlashStatus,
  formatWorkspaceSlashHelp,
  isWorkspaceSlashCommand,
  parseWorkspaceSlashCommand,
} from './workspace-slash-command'

describe('workspace-slash-command', () => {
  it('detects /workspace commands', () => {
    expect(isWorkspaceSlashCommand('/workspace')).toBe(true)
    expect(isWorkspaceSlashCommand('/workspace clear')).toBe(true)
    expect(isWorkspaceSlashCommand('/work')).toBe(false)
  })

  it('parses status, clear, pick, and path forms', () => {
    expect(parseWorkspaceSlashCommand('/workspace')).toEqual({ kind: 'status' })
    expect(parseWorkspaceSlashCommand('/workspace clear')).toEqual({
      kind: 'clear',
    })
    expect(parseWorkspaceSlashCommand('/workspace pick')).toEqual({
      kind: 'pick',
    })
    expect(parseWorkspaceSlashCommand('/workspace ~/code/app')).toEqual({
      kind: 'set',
      path: '~/code/app',
    })
    expect(parseWorkspaceSlashCommand('/workspace "/tmp/my project"')).toEqual({
      kind: 'set',
      path: '/tmp/my project',
    })
  })

  it('formats help and status lines', () => {
    expect(formatWorkspaceSlashHelp()).toContain('/workspace pick')
    expect(
      describeWorkspaceSlashStatus('/Users/me/proj', null, true),
    ).toContain('/Users/me/proj')
    expect(
      describeWorkspaceSlashStatus(null, '/Users/me/next', false),
    ).toContain('next conversation')
  })
})
