import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  extractBulletListFromMarkdown,
  extractJsonArrayFromContent,
  findSandboxArtifactContent,
  resolveCollectFormFromMarkdown,
  resolveFormFieldsFromMarkdown,
} from './schema-resolve'

describe('extractBulletListFromMarkdown', () => {
  it('reads bullets under a heading', () => {
    const md = `## Top tags for today
- life
- love

## Other
- skip
`
    expect(extractBulletListFromMarkdown(md, 'Top tags for today')).toEqual([
      'life',
      'love',
    ])
  })
})

describe('extractJsonArrayFromContent', () => {
  it('reads tags array from json body', () => {
    const body = '{"top_tags_today":["life","love"]}'
    expect(extractJsonArrayFromContent(body)).toEqual(['life', 'love'])
  })
})

describe('findSandboxArtifactContent', () => {
  it('finds newest top-tags file under output/toolLoop', async () => {
    const root = join(tmpdir(), `openfde-form-resolve-${Date.now()}`)
    const path = join(
      root,
      'output',
      'toolLoop',
      'todo-1',
      'results',
      'top-tags-today.md',
    )
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(
      path,
      '# Top tags\n- life\n- inspirational\n',
      'utf-8',
    )

    const content = await findSandboxArtifactContent(root, 'top-tags-today.md')
    expect(content).toContain('life')
  })
})

describe('resolveFormFieldsFromMarkdown', () => {
  it('injects select options from prior-step artifact', async () => {
    const root = join(tmpdir(), `openfde-form-resolve2-${Date.now()}`)
    const artifactPath = join(
      root,
      'output',
      'toolLoop',
      'step-1',
      'results',
      'top-tags-today.md',
    )
    await mkdir(join(artifactPath, '..'), { recursive: true })
    await writeFile(
      artifactPath,
      '## Tags\n- life\n- love\n- friendship\n',
      'utf-8',
    )

    const formMd = `## Top tags for today (from Step 1)
- life

<!-- FORM_SCHEMA
{"fields":[
  {"key":"tag_filter","label":"Tag","type":"select","required":false,"optionsFrom":{"artifact":"top-tags-today.md","parse":"bullets"}},
  {"key":"quote_search","label":"Search","type":"string","required":true}
]}
-->`

    const fields = await resolveFormFieldsFromMarkdown(formMd, {
      sandboxRoot: root,
    })
    const tagField = fields.find((f) => f.key === 'tag_filter')
    expect(tagField?.type).toBe('select')
    expect(tagField?.options?.map((o) => o.value)).toEqual([
      'life',
      'love',
      'friendship',
    ])
  })

  it('falls back to string when artifact missing', async () => {
    const formMd = `<!-- FORM_SCHEMA {"fields":[{"key":"tag_filter","label":"Tag","type":"select","optionsFrom":{"artifact":"missing.md"}}]} -->`
    const fields = await resolveFormFieldsFromMarkdown(formMd, {
      sandboxRoot: join(tmpdir(), 'nonexistent-sandbox'),
    })
    expect(fields[0]?.type).toBe('string')
  })

  it('resolves title, message, and select options from form-projection.json', async () => {
    const root = join(tmpdir(), `openfde-form-projection-${Date.now()}`)
    const artifactPath = join(
      root,
      'output',
      'toolLoop',
      'step-1',
      'form-projection.json',
    )
    await mkdir(join(artifactPath, '..'), { recursive: true })
    await writeFile(
      artifactPath,
      JSON.stringify({
        title: 'Select a tag',
        message: 'Top tags from the previous step:',
        options: {
          tag_filter: [
            { value: 'life', label: 'Life' },
            'love',
          ],
        },
      }),
      'utf-8',
    )

    const formMd = `<!-- FORM_SCHEMA
{"projectionArtifact":"form-projection.json",
 "titleFrom":{"jsonPath":"$.title"},
 "messageFrom":{"jsonPath":"$.message"},
 "fields":[
   {"key":"tag_filter","label":"Tag","type":"select","optionsFrom":{"jsonPath":"$.options.tag_filter"}},
   {"key":"quote_search","label":"Search","type":"string","required":true}
 ]}
-->`

    const resolved = await resolveCollectFormFromMarkdown(formMd, {
      sandboxRoot: root,
    })

    expect(resolved.title).toBe('Select a tag')
    expect(resolved.message).toBe('Top tags from the previous step:')
    const tagField = resolved.fields.find((f) => f.key === 'tag_filter')
    expect(tagField?.type).toBe('select')
    expect(tagField?.options).toEqual([
      { value: 'life', label: 'Life' },
      { value: 'love', label: 'love' },
    ])
  })

  it('reads title and options from custom projectionArtifact file', async () => {
    const root = join(tmpdir(), `openfde-form-custom-proj-${Date.now()}`)
    const artifactPath = join(
      root,
      'output',
      'toolLoop',
      'step-2',
      'quote-step-projection.json',
    )
    await mkdir(join(artifactPath, '..'), { recursive: true })
    await writeFile(
      artifactPath,
      JSON.stringify({
        title: 'Custom title',
        message: 'Custom message',
        options: { engine: ['ddg'] },
      }),
      'utf-8',
    )

    const formMd = `<!-- FORM_SCHEMA
{"projectionArtifact":"quote-step-projection.json",
 "titleFrom":{"jsonPath":"$.title"},
 "messageFrom":{"jsonPath":"$.message"},
 "fields":[{"key":"engine","label":"Engine","type":"select","optionsFrom":{"jsonPath":"$.options.engine"}}]}
-->`

    const resolved = await resolveCollectFormFromMarkdown(formMd, {
      sandboxRoot: root,
    })
    expect(resolved.title).toBe('Custom title')
    expect(resolved.message).toBe('Custom message')
    expect(resolved.fields[0]?.options).toEqual([{ value: 'ddg', label: 'ddg' }])
  })
})
