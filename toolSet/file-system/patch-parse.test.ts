import { describe, expect, it } from 'vitest'
import { parsePatch, deriveNewContentsFromChunks } from './patch-parse'

describe('patch-parse', () => {
  it('parses add file hunk', () => {
    const patch = `*** Begin Patch
*** Add File: new.txt
+line one
+line two
*** End Patch`
    const { hunks } = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      type: 'add',
      path: 'new.txt',
      contents: 'line one\nline two',
    })
  })

  it('parses update hunk and applies chunks', () => {
    const patch = `*** Begin Patch
*** Update File: foo.txt
@@
 old line
-new line
+new line updated
*** End Patch`
    const { hunks } = parsePatch(patch)
    expect(hunks[0]?.type).toBe('update')
    if (hunks[0]?.type !== 'update') return

    const result = deriveNewContentsFromChunks(
      'foo.txt',
      hunks[0].chunks,
      'prefix\nold line\nnew line\nsuffix\n',
    )
    expect(result).toContain('new line updated')
    expect(result).not.toContain('\nnew line\n')
  })

  it('rejects patch without markers', () => {
    expect(() => parsePatch('not a patch')).toThrow(/Begin\/End markers/)
  })

  it('parses delete and move update hunks', () => {
    const patch = `*** Begin Patch
*** Delete File: old.txt
*** Update File: src/a.ts
*** Move to: src/b.ts
@@
 export const a = 1
-export const b = 2
+export const b = 3
*** End Patch`

    const { hunks } = parsePatch(patch)
    expect(hunks[0]).toMatchObject({ type: 'delete', path: 'old.txt' })
    expect(hunks[1]).toMatchObject({
      type: 'update',
      path: 'src/a.ts',
      move_path: 'src/b.ts',
    })
  })

  it('parses heredoc-wrapped patch text', () => {
    const patch = `cat <<'PATCH'
*** Begin Patch
*** Add File: docs/note.txt
+hello
*** End Patch
PATCH`
    const { hunks } = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({ type: 'add', path: 'docs/note.txt' })
  })

  it('applies end-of-file replacement chunk', () => {
    const original = 'line1\nline2\n'
    const result = deriveNewContentsFromChunks(
      'sample.txt',
      [
        {
          old_lines: ['line2'],
          new_lines: ['line2-updated'],
          is_end_of_file: true,
        },
      ],
      original,
    )
    expect(result).toBe('line1\nline2-updated\n')
  })

  it('applies insertion chunk when old_lines is empty', () => {
    const result = deriveNewContentsFromChunks(
      'empty.txt',
      [
        {
          old_lines: [],
          new_lines: ['inserted'],
        },
      ],
      '',
    )
    expect(result).toBe('inserted\n')
  })

  it('throws when chunk context is missing', () => {
    expect(() =>
      deriveNewContentsFromChunks(
        'ctx.txt',
        [
          {
            old_lines: ['before'],
            new_lines: ['after'],
            change_context: 'not-here',
          },
        ],
        'x\ny\n',
      ),
    ).toThrow(/Failed to find context/)
  })
})
