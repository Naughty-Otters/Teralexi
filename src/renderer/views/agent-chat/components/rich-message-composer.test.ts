/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

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
