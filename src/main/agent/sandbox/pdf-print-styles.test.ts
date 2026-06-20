import { describe, expect, it } from 'vitest'
import {
  PDF_MONO_FONT_STACK,
  PDF_SERIF_FONT_STACK,
  pdfDocumentFontFaceCss,
} from './pdf-print-styles'

describe('pdf-print-styles', () => {
  it('uses local() font faces without external URLs', () => {
    const css = pdfDocumentFontFaceCss()
    expect(css).toContain("@font-face")
    expect(css).toContain("local('Times New Roman')")
    expect(css).not.toMatch(/https?:\/\//)
  })

  it('prefers universal serif and mono stacks', () => {
    expect(PDF_SERIF_FONT_STACK).toContain('Times New Roman')
    expect(PDF_SERIF_FONT_STACK).not.toContain('Georgia')
    expect(PDF_MONO_FONT_STACK).toContain('Menlo')
    expect(PDF_MONO_FONT_STACK).not.toContain('Cascadia')
  })
})
