import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearStepOutputPreviewCache,
  detectStepOutputPreviewKind,
  filePathFromFileUrl,
  jpegDataUrlFromNativeImage,
} from './step-output-preview'

describe('step-output-preview', () => {
  beforeEach(() => {
    clearStepOutputPreviewCache()
  })

  it('parses file URLs to paths', () => {
    const p = filePathFromFileUrl('file:///tmp/out/result.html')
    expect(p).toBeTruthy()
    expect(p!.replace(/\\/g, '/')).toMatch(/\/tmp\/out\/result\.html$/)
  })

  it('detects preview kinds by extension', () => {
    expect(detectStepOutputPreviewKind('/x/chart.png')).toBe('image')
    expect(detectStepOutputPreviewKind('/x/page.html')).toBe('html')
    expect(detectStepOutputPreviewKind('/x/report.pdf')).toBe('pdf')
    expect(detectStepOutputPreviewKind('/x/data.json')).toBe('none')
  })

  it('builds jpeg data URLs from native images', () => {
    const img = {
      getSize: () => ({ width: 200, height: 100 }),
      resize: () => ({
        toJPEG: () => Buffer.from('jpeg-preview'),
      }),
    } as Electron.NativeImage
    const dataUrl = jpegDataUrlFromNativeImage(img)
    expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })
})
