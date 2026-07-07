import { describe, expect, it } from 'vitest'
import { rendererElectronCompatPlugin } from './renderer-electron-compat'

describe('rendererElectronCompatPlugin', () => {
  it('strips crossorigin from emitted script and link tags', () => {
    const plugin = rendererElectronCompatPlugin()
    const html = `<!doctype html>
<script type="module" crossorigin src="./assets/index.js"></script>
<link rel="modulepreload" crossorigin href="./assets/vendor.js">
<link rel="stylesheet" crossorigin href="./assets/style.css">`

    const result = plugin.transformIndexHtml?.(html)
    expect(result).not.toContain('crossorigin')
    expect(result).not.toContain('modulepreload')
    expect(result).toContain('<script type="module" src="./assets/index.js">')
    expect(result).toContain('href="./assets/style.css"')
  })
})
