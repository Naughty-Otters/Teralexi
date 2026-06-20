import { describe, expect, it } from 'vitest'
import {
  conversationWorkspaceStack,
  workspaceActiveLabel,
  workspaceBasename,
  workspacePathFromStack,
} from './workspace'

describe('workspace helpers', () => {
  it('builds stack with or without workspace', () => {
    expect(conversationWorkspaceStack(null)).toEqual([{ type: 'sandbox' }])
    expect(conversationWorkspaceStack('  ')).toEqual([{ type: 'sandbox' }])
    expect(conversationWorkspaceStack('/proj')).toEqual([
      { type: 'sandbox' },
      { type: 'workspace', path: '/proj' },
    ])
  })

  it('reads workspace path from stack', () => {
    expect(workspacePathFromStack([{ type: 'sandbox' }])).toBeNull()
    expect(
      workspacePathFromStack([
        { type: 'sandbox' },
        { type: 'workspace', path: '/x' },
      ]),
    ).toBe('/x')
  })

  it('workspaceBasename handles posix and windows paths', () => {
    expect(workspaceBasename('/home/user/project')).toBe('project')
    expect(workspaceBasename('C:\\Users\\me\\repo')).toBe('repo')
    expect(workspaceBasename('C:/Users/me/repo/')).toBe('repo')
  })

  it('workspaceActiveLabel returns Sandbox or basename', () => {
    expect(workspaceActiveLabel(null)).toBe('Sandbox')
    expect(workspaceActiveLabel('C:\\work\\my-app')).toBe('my-app')
  })
})
