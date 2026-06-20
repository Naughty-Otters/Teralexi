/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import {
  filterSubAgentMentionMenuItems,
  shouldPreferSubAgentMentionMenu,
} from './composer-sub-agent-mentions'
import type { SubAgentTarget } from '@shared/agent/sub-agent-targets'

const targets: SubAgentTarget[] = [
  {
    id: 'skill:coding',
    name: 'Code',
    description: 'Coding agent',
    mentionSlug: 'skill:coding',
  },
]

describe('RichMessageComposer markdown round-trip', () => {
  it('serializes bold markdown from WYSIWYG content', () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: false,
          horizontalRule: false,
          codeBlock: false,
          link: { openOnClick: false },
        }),
        Markdown,
      ],
      content: 'Hello **world**',
      contentType: 'markdown',
    })

    const md = editor.getMarkdown()
    expect(md).toMatch(/world/)
    expect(md).toMatch(/\*\*world\*\*|__world__/)

    editor.destroy()
  })
})

describe('composer @ mention menu routing', () => {
  it('prefers sub-agent menu for word slugs', () => {
    expect(shouldPreferSubAgentMentionMenu('cod', true, targets)).toBe(true)
    expect(filterSubAgentMentionMenuItems(targets, 'cod')).toHaveLength(1)
  })

  it('prefers file menu for path-like @ queries', () => {
    expect(shouldPreferSubAgentMentionMenu('src/foo.ts', true, targets)).toBe(
      false,
    )
    expect(shouldPreferSubAgentMentionMenu('src/', true, targets)).toBe(false)
  })

  it('uses file menu when sub-agent mentions are disabled', () => {
    expect(shouldPreferSubAgentMentionMenu('cod', false, targets)).toBe(false)
  })
})
