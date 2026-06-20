import * as cheerio from 'cheerio'
import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, isParseableMarkdown } from './html-to-markdown'

describe('htmlToMarkdown', () => {
  it('converts headings, links, and lists', () => {
    const $ = cheerio.load(`
      <article>
        <h1>Hello</h1>
        <p>Intro <a href="/docs">docs</a></p>
        <ul><li>One</li><li>Two</li></ul>
      </article>
    `)
    const md = htmlToMarkdown($.root().html() ?? '')
    expect(md).toContain('# Hello')
    expect(md).toMatch(/\[docs\]\(\/docs\)/)
    expect(md).toMatch(/-\s+One/)
    expect(isParseableMarkdown(md)).toBe(true)
  })

  it('converts tables to markdown pipes', () => {
    const md = htmlToMarkdown(`
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    `)
    expect(md).toContain('| A | B |')
    expect(md).toContain('| 1 | 2 |')
  })
})
