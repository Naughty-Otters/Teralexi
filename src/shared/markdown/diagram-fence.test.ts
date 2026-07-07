import { describe, expect, it } from 'vitest'
import {
  applyDiagramFencePlugin,
  resolveDiagramBlocksInHtml,
} from './create-markdown-it'
import { createStandardMarkdownItEager } from './create-markdown-it-eager'
import MarkdownIt from 'markdown-it'

const sampleSpec = JSON.stringify({
  version: 1,
  viewBox: [0, 0, 400, 120],
  layers: [
    {
      type: 'text',
      items: [{ at: { x: 10, y: 20 }, text: 'Hello diagram' }],
    },
  ],
})

describe('diagram fence markdown plugin', () => {
  it('creates pending placeholder for valid diagram fence', () => {
    const md = createStandardMarkdownItEager()
    const html = md.render(`\`\`\`diagram\n${sampleSpec}\n\`\`\``)
    expect(html).toContain('diagram-block--pending')
    expect(html).toContain('data-diagram-spec=')
  })

  it('falls back to code block for invalid JSON', () => {
    const md = createStandardMarkdownItEager()
    const html = md.render('```diagram\n{ not json\n```')
    expect(html).toContain('<pre')
    expect(html).not.toContain('diagram-block')
  })

  it('resolveDiagramBlocksInHtml renders SVG', () => {
    const md = createStandardMarkdownItEager()
    const html = md.render(`\`\`\`diagram\n${sampleSpec}\n\`\`\``)
    const resolved = resolveDiagramBlocksInHtml(html)
    expect(resolved).toContain('diagram-block--ready')
    expect(resolved).toContain('<svg')
    expect(resolved).toContain('Hello diagram')
    expect(resolved).not.toContain('diagram-block--pending')
  })

  it('applyDiagramFencePlugin can be added to existing MarkdownIt', () => {
    const md = new MarkdownIt({ html: false, breaks: true, linkify: true })
    applyDiagramFencePlugin(md)
    const html = md.render(`\`\`\`diagram\n${sampleSpec}\n\`\`\``)
    expect(html).toContain('diagram-block--pending')
  })
})
