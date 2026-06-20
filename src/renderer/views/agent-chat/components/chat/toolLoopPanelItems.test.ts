import { describe, expect, it } from 'vitest'
import {
  TOOL_LOOP_PANEL_MAX_ITEMS,
  toolLoopPanelItemViewer,
  visibleToolLoopPanelItems,
} from './toolLoopPanelItems'

describe('visibleToolLoopPanelItems', () => {
  it('returns all items when within the cap', () => {
    const items = [1, 2, 3]
    expect(visibleToolLoopPanelItems(items)).toEqual({
      visible: items,
      droppedCount: 0,
    })
  })

  it('keeps only the latest items and reports dropped count', () => {
    const items = Array.from({ length: 15 }, (_, i) => i + 1)
    const { visible, droppedCount } = visibleToolLoopPanelItems(items)

    expect(droppedCount).toBe(5)
    expect(visible).toHaveLength(TOOL_LOOP_PANEL_MAX_ITEMS)
    expect(visible[0]).toBe(6)
    expect(visible[9]).toBe(15)
  })

  it('resolves rich viewer for completed file-change tools', () => {
    expect(
      toolLoopPanelItemViewer(
        {
          type: 'tool-edit_file',
          state: 'output-available',
          input: {},
          output: {
            resultType: 'file_change',
            files: [
              {
                path: 'a.ts',
                diff: '@@ -1 +1 @@\n-old\n+new',
                additions: 1,
                deletions: 1,
              },
            ],
          },
        },
        false,
      ),
    ).toBe('diff')
    expect(
      toolLoopPanelItemViewer(
        { type: 'tool-grep', state: 'input-available', input: {} },
        true,
      ),
    ).toBeNull()
  })
})
