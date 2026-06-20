import { describe, expect, it } from 'vitest'
import {
  classifyConversationToolViewer,
  conversationShouldUseToolLoopPanel,
  conversationToolBubblesToPanelItems,
  listToolLoopProgressAnchors,
  partitionToolsByToolLoopBoundaries,
  resolveConversationToolLoopPanelSlots,
  resolveConversationToolResponseBubbles,
  sectionIndexForToolLoopAnchor,
} from './conversationToolResponseModel'
import type { StructuredDebugSection } from '../../structuredDebugViewModel'

function toolPart(
  name: string,
  state: string,
  output?: unknown,
): Record<string, unknown> {
  return {
    type: `tool-${name}`,
    state,
    input: {},
    output,
  }
}

describe('conversationToolResponseModel', () => {
  it('classifies file read results as file viewer', () => {
    expect(
      classifyConversationToolViewer(
        toolPart('read_file', 'output-available', {
          resultType: 'query',
          path: 'src/main.ts',
          content: 'export const x = 1\n',
        }),
      ),
    ).toBe('file')
  })

  it('classifies terminal output as terminal viewer', () => {
    expect(
      classifyConversationToolViewer(
        toolPart('bash', 'output-available', {
          resultType: 'terminal',
          stdout: 'hello\n',
          exitCode: 0,
        }),
      ),
    ).toBe('terminal')
  })

  it('classifies file changes as diff viewer', () => {
    expect(
      classifyConversationToolViewer(
        toolPart('edit_file', 'output-available', {
          resultType: 'file_change',
          files: [{ path: 'a.ts', diff: '@@ -1 +1 @@\n-old\n+new', additions: 1, deletions: 1 }],
        }),
      ),
    ).toBe('diff')
  })

  it('skips pending approval tools', () => {
    expect(
      classifyConversationToolViewer({
        type: 'tool-exit_plan_mode',
        state: 'approval-requested',
        input: {},
      }),
    ).toBeNull()
  })

  it('resolves bubbles from message parts', () => {
    const bubbles = resolveConversationToolResponseBubbles({
      id: 'msg-1',
      role: 'assistant',
      parts: [
        toolPart('grep', 'output-available', {
          resultType: 'raw',
          content: 'matches: 2',
        }),
        toolPart('read_file', 'input-available', {
          resultType: 'query',
          content: 'pending',
        }),
      ],
    } as never)

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.toolName).toBe('grep')
  })

  it('lists each tool-loop progress anchor in order', () => {
    const anchors = listToolLoopProgressAnchors([
      {
        id: 'toolLoop-1',
        data: {
          stepId: 'toolLoop',
          title: 'Agentic Run',
          sequence: 1,
          content: 'Loop one',
        },
      },
      {
        id: 'toolLoop-2',
        data: {
          stepId: 'toolLoop',
          title: 'Agentic Run',
          sequence: 2,
          content: 'Loop two',
        },
      },
    ])

    expect(anchors.map((anchor) => anchor.key)).toEqual([
      'toolLoop-1',
      'toolLoop-2',
    ])
  })

  it('partitions tools between tool-loop boundaries', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'data-agent-step-progress',
          id: 'toolLoop-1',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 1,
            content: 'Loop one',
          },
        },
        toolPart('grep', 'output-available', {
          resultType: 'raw',
          content: 'first-loop',
        }),
        {
          type: 'data-agent-step-progress',
          id: 'toolLoop-2',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 2,
            content: 'Loop two',
          },
        },
        toolPart('bash', 'output-available', {
          resultType: 'terminal',
          stdout: 'second-loop',
          exitCode: 0,
        }),
      ],
    } as never

    const anchors = listToolLoopProgressAnchors(
      message.parts.filter(
        (part: { type?: string }) => part.type === 'data-agent-step-progress',
      ),
    )
    const buckets = partitionToolsByToolLoopBoundaries(message, anchors)

    expect(buckets.get('toolLoop-1')?.map((bubble) => bubble.toolName)).toEqual([
      'grep',
    ])
    expect(buckets.get('toolLoop-2')?.map((bubble) => bubble.toolName)).toEqual([
      'bash',
    ])
  })

  it('builds one panel slot per tool loop with only the latest live', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'data-agent-step-progress',
          id: 'toolLoop-1',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 1,
            status: 'completed',
            content: 'Loop one',
          },
        },
        toolPart('grep', 'output-available', {
          resultType: 'raw',
          content: 'first-loop',
        }),
        {
          type: 'data-agent-step-progress',
          id: 'toolLoop-2',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 2,
            status: 'running',
            content: 'Loop two',
          },
        },
        toolPart('bash', 'output-available', {
          resultType: 'terminal',
          stdout: 'second-loop',
          exitCode: 0,
        }),
      ],
    } as never

    const sections: StructuredDebugSection[] = [
      {
        id: 'SkillsToolExecutionStep',
        title: 'Agentic Run',
        bodyHtml: '',
        status: 'done',
        progressPartKey: 'toolLoop-1',
      },
      {
        id: 'SkillsToolExecutionStep',
        title: 'Agentic Run',
        bodyHtml: '',
        status: 'running',
        progressPartKey: 'toolLoop-2',
      },
    ]

    const slots = resolveConversationToolLoopPanelSlots({
      message,
      sections,
      stepProgressParts: message.parts.filter(
        (part: { type?: string }) => part.type === 'data-agent-step-progress',
      ),
      frozenItemsByAnchorKey: new Map([
        [
          'toolLoop-1',
          conversationToolBubblesToPanelItems(
            partitionToolsByToolLoopBoundaries(
              message,
              listToolLoopProgressAnchors(
                message.parts.filter(
                  (part: { type?: string }) =>
                    part.type === 'data-agent-step-progress',
                ),
              ),
            ).get('toolLoop-1') ?? [],
          ),
        ],
      ]),
      isStreaming: true,
    })

    expect(slots).toHaveLength(2)
    expect(slots[0]?.live).toBe(false)
    expect(slots[1]?.live).toBe(true)
    expect(sectionIndexForToolLoopAnchor(sections, 'toolLoop-1')).toBe(0)
    expect(sectionIndexForToolLoopAnchor(sections, 'toolLoop-2')).toBe(1)
  })

  it('maps conversation bubbles to tool-loop panel items', () => {
    const bubbles = resolveConversationToolResponseBubbles({
      id: 'msg-1',
      role: 'assistant',
      parts: [
        toolPart('bash', 'output-available', {
          resultType: 'terminal',
          stdout: 'ok',
          exitCode: 0,
        }),
        toolPart('grep', 'output-available', {
          resultType: 'raw',
          content: 'matches',
        }),
      ],
    } as never)

    expect(conversationToolBubblesToPanelItems(bubbles)).toEqual([
      expect.objectContaining({ kind: 'terminal', key: bubbles[0]?.key }),
      expect.objectContaining({ kind: 'tool', key: bubbles[1]?.key }),
    ])
  })

  it('uses tool-loop panel when agentic run section is present', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant',
      parts: [toolPart('grep', 'output-available', { resultType: 'raw', content: 'x' })],
    } as never

    const sections: StructuredDebugSection[] = [
      {
        id: 'SkillsToolExecutionStep',
        title: 'Execution',
        bodyHtml: '',
        status: 'running',
      },
    ]

    expect(conversationShouldUseToolLoopPanel(message, sections)).toBe(true)
    expect(conversationShouldUseToolLoopPanel(message, [])).toBe(false)
  })

  it('keeps only the latest todo tool bubble when read and update both present', () => {
    const checklist = {
      todos: [
        { id: 't1', content: 'Step one', status: 'pending' },
        { id: 't2', content: 'Step two', status: 'pending' },
      ],
      summary: { total: 2, pending: 2, inProgress: 0, completed: 0, cancelled: 0 },
    }
    const bubbles = resolveConversationToolResponseBubbles({
      id: 'msg-1',
      role: 'assistant',
      parts: [
        toolPart('update_todos', 'output-available', checklist),
        toolPart('read_todos', 'output-available', checklist),
      ],
    } as never)

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.toolName).toBe('read_todos')
  })

  it('uses tool-loop panel when message has toolLoop progress', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'data-agent-step-progress',
          data: { stepId: 'toolLoop', status: 'running' },
        },
        toolPart('grep', 'output-available', { resultType: 'raw', content: 'x' }),
      ],
    } as never

    expect(conversationShouldUseToolLoopPanel(message, [])).toBe(true)
  })

  it('uses shell anchor when toolLoop progress has no content yet', () => {
    const anchors = listToolLoopProgressAnchors([
      {
        id: 'toolLoop-1',
        data: {
          stepId: 'toolLoop',
          title: 'Agentic Run',
          sequence: 1,
          status: 'running',
        },
      },
    ])

    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.key).toBe('toolLoop-1')
  })

  it('falls back to a single panel when anchors cannot partition tools', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        toolPart('grep', 'output-available', {
          resultType: 'raw',
          content: 'orphan',
        }),
        {
          type: 'data-agent-step-progress',
          id: 'toolLoop-1',
          data: {
            stepId: 'toolLoop',
            title: 'Agentic Run',
            sequence: 1,
            status: 'running',
            content: 'Working',
          },
        },
      ],
    } as never

    const sections: StructuredDebugSection[] = [
      {
        id: 'SkillsToolExecutionStep',
        title: 'Agentic Run',
        bodyHtml: '',
        status: 'running',
      },
    ]

    const slots = resolveConversationToolLoopPanelSlots({
      message,
      sections,
      stepProgressParts: message.parts.filter(
        (part: { type?: string }) => part.type === 'data-agent-step-progress',
      ),
      frozenItemsByAnchorKey: new Map(),
      isStreaming: true,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0]?.items).toHaveLength(1)
    expect(slots[0]?.sectionIndex).toBe(0)
  })
})
