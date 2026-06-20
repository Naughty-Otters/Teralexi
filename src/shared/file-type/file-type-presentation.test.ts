import { describe, expect, it } from 'vitest'
import {
  attachmentFilePathClass,
  extensionFromPath,
  resolveFileTypePresentation,
} from './file-type-presentation'

describe('resolveFileTypePresentation', () => {
  it('maps common extensions to icons and tones', () => {
    expect(resolveFileTypePresentation('src/app.tsx').icon).toBe(
      'i-lucide-file-code-2',
    )
    expect(resolveFileTypePresentation('README.md').tone).toBe('markup')
    expect(resolveFileTypePresentation('output/results/report.pdf').icon).toBe(
      'i-lucide-file-type',
    )
    expect(resolveFileTypePresentation('schema.json').tone).toBe('data')
    expect(resolveFileTypePresentation('photo.png').icon).toBe(
      'i-lucide-file-image',
    )
  })

  it('falls back for unknown extensions', () => {
    expect(resolveFileTypePresentation('notes.xyz')).toEqual({
      tone: 'default',
      icon: 'i-lucide-file',
      kindLabel: 'File',
    })
  })

  it('extracts extension from labels with query strings', () => {
    expect(extensionFromPath('file:///tmp/a.html?x=1')).toBe('html')
  })

  it('builds path class list from extension', () => {
    expect(attachmentFilePathClass('app.ts')).toEqual([
      'attachment-file-path',
      'file-type-presentation--code',
    ])
    expect(
      attachmentFilePathClass('old.txt', { deleted: true }),
    ).toContain('attachment-file-path--deleted')
  })
})
