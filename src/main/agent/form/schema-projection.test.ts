import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { FORM_PROJECTION_ARTIFACT_DEFAULT } from './form-projection'
import {
  parseFormSchemaFromMarkdown,
  resolveSelectValue,
} from './schema'
import { resolveCollectFormFromMarkdown, resolveOptionsFromSpec } from './schema-resolve'

async function writeProjection(
  root: string,
  fileName: string,
  payload: unknown,
): Promise<void> {
  const path = join(root, 'output', 'toolLoop', 'step-1', fileName)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(payload), 'utf-8')
}

describe('form projection schema + resolve', () => {
  it('parses static title, message, and projectionArtifact', () => {
    const md = `<!-- FORM_SCHEMA
{"title":"Static title","message":"Static message","projectionArtifact":"custom-projection.json",
 "fields":[{"key":"x","label":"X","type":"string"}]}
-->`
    expect(parseFormSchemaFromMarkdown(md)).toMatchObject({
      title: 'Static title',
      message: 'Static message',
      projectionArtifact: 'custom-projection.json',
    })
  })

  it('prefers static title/message over projection bindings', async () => {
    const root = join(tmpdir(), `openfde-form-static-${Date.now()}`)
    await writeProjection(root, FORM_PROJECTION_ARTIFACT_DEFAULT, {
      title: 'From JSON',
      message: 'From JSON body',
    })

    const md = `<!-- FORM_SCHEMA
{"title":"Static title","message":"Static message",
 "titleFrom":{"jsonPath":"$.title"},
 "messageFrom":{"jsonPath":"$.message"},
 "fields":[{"key":"x","label":"X","type":"string"}]}
-->`

    const resolved = await resolveCollectFormFromMarkdown(md, { sandboxRoot: root })
    expect(resolved.title).toBe('Static title')
    expect(resolved.message).toBe('Static message')
  })

  it('auto-resolves select options from $.options.<fieldKey>', async () => {
    const root = join(tmpdir(), `openfde-form-auto-${Date.now()}`)
    await writeProjection(root, FORM_PROJECTION_ARTIFACT_DEFAULT, {
      options: { engine: ['ddg', 'bing'] },
    })

    const md = `<!-- FORM_SCHEMA
{"fields":[{"key":"engine","label":"Engine","type":"select","optionsFrom":{"artifact":"form-projection.json"}}]}
-->`

    const resolved = await resolveCollectFormFromMarkdown(md, { sandboxRoot: root })
    expect(resolved.fields[0]).toMatchObject({
      type: 'select',
      options: [
        { value: 'ddg', label: 'ddg' },
        { value: 'bing', label: 'bing' },
      ],
    })
  })

  it('merges static select options when projection json path misses', async () => {
    const root = join(tmpdir(), `openfde-form-merge-${Date.now()}`)
    await writeProjection(root, FORM_PROJECTION_ARTIFACT_DEFAULT, {
      options: { tag: ['love'] },
    })

    const options = await resolveOptionsFromSpec(
      { jsonPath: '$.options.missing' },
      '',
      { sandboxRoot: root },
      [{ value: 'life', label: 'Life' }],
      { fieldKey: 'tag', schemaDefaultArtifact: FORM_PROJECTION_ARTIFACT_DEFAULT },
    )

    expect(options?.map((o) => o.value)).toEqual(['life'])
  })

  it('uses markdownHeading options via resolveOptionsFromSpec', async () => {
    const formMd = `## Choices
- alpha
- beta

## Other
- skip
`
    const options = await resolveOptionsFromSpec(
      { markdownHeading: 'Choices' },
      formMd,
      {},
    )
    expect(options?.map((o) => o.value)).toEqual(['alpha', 'beta'])
  })

  it('returns undefined title/message when projection missing', async () => {
    const md = `<!-- FORM_SCHEMA
{"titleFrom":{"jsonPath":"$.title"},"messageFrom":{"jsonPath":"$.message"},
 "fields":[{"key":"x","label":"X","type":"string"}]}
-->`

    const resolved = await resolveCollectFormFromMarkdown(md, {
      sandboxRoot: join(tmpdir(), 'missing-projection-root'),
    })
    expect(resolved.title).toBeUndefined()
    expect(resolved.message).toBeUndefined()
  })

  it('resolveSelectValue matches labels case-insensitively', () => {
    const field = {
      key: 'tag',
      label: 'Tag',
      type: 'select' as const,
      options: [{ value: 'life', label: 'Life' }],
    }
    expect(resolveSelectValue(field, 'LIFE')).toBe('life')
    expect(resolveSelectValue(field, 'Life')).toBe('life')
  })

  it('resolveOptionsFromSpec returns static options when sandbox missing', async () => {
    const options = await resolveOptionsFromSpec(
      { jsonPath: '$.options.tag' },
      '',
      {},
      [{ value: 'fallback', label: 'Fallback' }],
      { fieldKey: 'tag' },
    )
    expect(options?.map((o) => o.value)).toEqual(['fallback'])
  })

  it('falls back select field to string when projection options empty', async () => {
    const md = `<!-- FORM_SCHEMA
{"fields":[{"key":"tag","label":"Tag","type":"select","optionsFrom":{"artifact":"form-projection.json"}}]}
-->`
    const resolved = await resolveCollectFormFromMarkdown(md, {
      sandboxRoot: join(tmpdir(), `openfde-form-empty-${Date.now()}`),
    })
    expect(resolved.fields[0]).toMatchObject({
      type: 'string',
      placeholder: expect.stringContaining('Prior step output not found'),
    })
  })

  it('loads options from markdown artifact when no jsonPath', async () => {
    const root = join(tmpdir(), `openfde-form-md-artifact-${Date.now()}`)
    const artifactPath = join(root, 'output', 'toolLoop', 'step-1', 'tags.md')
    await mkdir(join(artifactPath, '..'), { recursive: true })
    await writeFile(artifactPath, '- alpha\n- beta\n', 'utf-8')

    const options = await resolveOptionsFromSpec(
      { artifact: 'tags.md' },
      '',
      { sandboxRoot: root },
    )
    expect(options?.map((o) => o.value)).toEqual(['alpha', 'beta'])
  })
})
