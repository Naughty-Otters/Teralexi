import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import { collectConversationWorkspaceAttachments } from './conversation-workspace-attachments'

function toolMessage(
  parts: UIMessage['parts'],
): UIMessage {
  return {
    id: 'm1',
    role: 'assistant',
    parts,
  }
}

describe('collectConversationWorkspaceAttachments', () => {
  it('collects workspace text file changes from completed tool parts', () => {
    const messages = [
      toolMessage([
        {
          type: 'tool-edit_file',
          toolCallId: 'tc1',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            workspacePath: '/project',
            files: [
              {
                path: 'src/app.ts',
                diff: '--- src/app.ts\n+++ src/app.ts\n@@ -1 +1 @@\n-old\n+new',
                additions: 1,
                deletions: 1,
                action: 'modify',
                workspacePath: '/project',
              },
            ],
          },
        },
      ]),
    ]

    const items = collectConversationWorkspaceAttachments(messages)
    expect(items).toHaveLength(1)
    expect(items[0]?.displayPath).toBe('src/app.ts')
    expect(items[0]?.additions).toBe(1)
    expect(items[0]?.deletions).toBe(1)
    expect(items[0]?.diff).toContain('+new')
  })

  it('includes deleted workspace files and skips sandbox-only outputs', () => {
    const messages = [
      toolMessage([
        {
          type: 'tool-delete_file',
          toolCallId: 'tc2',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            workspacePath: '/project',
            files: [
              {
                path: 'src/old.ts',
                diff: '--- src/old.ts\n+++ /dev/null\n@@ -1 +0 @@\n-line',
                additions: 0,
                deletions: 1,
                action: 'delete',
                workspacePath: '/project',
              },
              {
                path: 'output/report.bin',
                diff: '--- output/report.bin\n+++ output/report.bin\n',
                additions: 0,
                deletions: 0,
                action: 'create',
              },
            ],
          },
        },
      ]),
    ]

    const items = collectConversationWorkspaceAttachments(messages)
    expect(items).toHaveLength(1)
    expect(items[0]?.action).toBe('delete')
    expect(items[0]?.deletions).toBe(1)
    expect(items[0]?.url).toBeUndefined()
  })

  it('resolves preview urls against workspace when sandboxRoot is also present', () => {
    const messages = [
      toolMessage([
        {
          type: 'tool-edit_file',
          toolCallId: 'tc-ws-url',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            workspacePath: '/project',
            files: [
              {
                path: 'src/app.ts',
                diff: '--- src/app.ts\n+++ src/app.ts\n@@ -1 +1 @@\n-old\n+new',
                additions: 1,
                deletions: 1,
                action: 'modify',
                workspacePath: '/project',
              },
            ],
          },
        },
      ]),
    ]

    const items = collectConversationWorkspaceAttachments(messages)
    expect(items[0]?.path).toBe('/project/src/app.ts')
    expect(items[0]?.url).toBe('file:///project/src/app.ts')
  })

  it('inherits workspacePath from tool output root on file rows', () => {
    const messages = [
      toolMessage([
        {
          type: 'tool-edit_file',
          toolCallId: 'tc-root-ws',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            workspacePath: '/project',
            files: [
              {
                path: 'src/lib.ts',
                diff: '--- src/lib.ts\n+++ src/lib.ts\n@@ -1 +1 @@\n-a\n+b',
                additions: 1,
                deletions: 1,
                action: 'modify',
              },
            ],
          },
        },
      ]),
    ]

    const items = collectConversationWorkspaceAttachments(messages)
    expect(items).toHaveLength(1)
    expect(items[0]?.path).toBe('/project/src/lib.ts')
    expect(items[0]?.url).toBe('file:///project/src/lib.ts')
  })

  it('does not include sandbox-only file creates in the workspace panel', () => {
    const messages = [
      toolMessage([
        {
          type: 'tool-write_file',
          toolCallId: 'tc-sandbox',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            files: [
              {
                path: 'output/report.html',
                diff: '--- output/report.html\n+++ output/report.html\n@@ -0,0 +1 @@\n+<html>',
                additions: 1,
                deletions: 0,
                action: 'create',
              },
            ],
          },
        },
      ]),
    ]

    expect(collectConversationWorkspaceAttachments(messages)).toEqual([])
  })

  it('merges later edits to the same workspace path', () => {
    const messages = [
      toolMessage([
        {
          type: 'tool-write_file',
          toolCallId: 'tc3',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            workspacePath: '/project',
            files: [
              {
                path: 'README.md',
                diff: 'a',
                additions: 2,
                deletions: 0,
                action: 'create',
                workspacePath: '/project',
              },
            ],
          },
        },
        {
          type: 'tool-edit_file',
          toolCallId: 'tc4',
          state: 'output-available',
          input: {},
          output: {
            sandboxRoot: '/sandbox',
            workspacePath: '/project',
            files: [
              {
                path: 'README.md',
                diff: 'b',
                additions: 5,
                deletions: 1,
                action: 'modify',
                workspacePath: '/project',
              },
            ],
          },
        },
      ]),
    ]

    const items = collectConversationWorkspaceAttachments(messages)
    expect(items).toHaveLength(1)
    expect(items[0]?.additions).toBe(5)
    expect(items[0]?.deletions).toBe(1)
  })
})
