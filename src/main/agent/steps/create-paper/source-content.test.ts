import { describe, expect, it } from 'vitest'
import {
  isSnippetOnlyPlaceholder,
  isSubstantiveDownloadedContent,
} from './source-content'

describe('isSnippetOnlyPlaceholder', () => {
  it('detects all legacy placeholder prefixes', () => {
    expect(
      isSnippetOnlyPlaceholder(
        '_Scraped page content unavailable. Search snippet only:_\n\nx',
      ),
    ).toBe(true)
    expect(
      isSnippetOnlyPlaceholder('_Page could not be fetched. Search snippet only:_'),
    ).toBe(true)
    expect(isSnippetOnlyPlaceholder('_Scraped page content unavailable._')).toBe(
      true,
    )
    expect(isSnippetOnlyPlaceholder('_Empty excerpt._')).toBe(true)
  })
})

describe('isSubstantiveDownloadedContent', () => {
  it('accepts real scraped bodies', () => {
    const body =
      '# Title\n\nThis is a longer paragraph with enough detail to support a research finding.'
    expect(isSubstantiveDownloadedContent(body)).toBe(true)
  })

  it('rejects SERP snippet placeholders', () => {
    expect(
      isSubstantiveDownloadedContent(
        '_Page could not be fetched. Search snippet only:_\n\nShort SERP text.',
      ),
    ).toBe(false)
  })

  it('rejects bodies shorter than the minimum length', () => {
    expect(isSubstantiveDownloadedContent('x'.repeat(49))).toBe(false)
    expect(isSubstantiveDownloadedContent('x'.repeat(50))).toBe(true)
  })

  it('rejects empty content', () => {
    expect(isSubstantiveDownloadedContent('')).toBe(false)
    expect(isSubstantiveDownloadedContent('   ')).toBe(false)
  })
})
