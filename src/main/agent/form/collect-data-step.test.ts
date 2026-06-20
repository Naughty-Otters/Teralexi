import { describe, expect, it, vi } from 'vitest'
import { ReferenceContext } from '../resources/context'
import { ReferenceDoc } from '../types'
import { resolveFormAttachmentDirsForSkill } from '@main/skills/skill-attachment-dirs'
import {
  findFormReferenceDoc,
  referenceDocIsCollectFormSchemaDoc,
  resolveFormDocName,
} from './collect-data-step'

vi.mock('@main/skills/skill-attachment-dirs', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('@main/skills/skill-attachment-dirs')>()
  return {
    ...mod,
    resolveFormAttachmentDirsForSkill: vi.fn(mod.resolveFormAttachmentDirsForSkill),
  }
})

const testReferences = new ReferenceContext()

describe('resolveFormDocName', () => {
  it('returns explicit form_doc_name when set', () => {
    const name = resolveFormDocName(
      testReferences,
      { form_doc_name: 'my.form.md' } as never,
      [],
    )
    expect(name).toBe('my.form.md')
  })

  it('infers name when exactly one form doc reference exists', () => {
    const docs = [new ReferenceDoc('form/run.form.md')]
    expect(resolveFormDocName(testReferences, {} as never, docs)).toBe('run.form.md')
  })

  it('returns undefined when multiple form docs', () => {
    const docs = [
      new ReferenceDoc('form/a.form.md'),
      new ReferenceDoc('form/b.form.md'),
    ]
    expect(resolveFormDocName(testReferences, {} as never, docs)).toBeUndefined()
  })
})

describe('findFormReferenceDoc', () => {
  const docs = [new ReferenceDoc('skills/x/deploy.form.md')]

  it('matches by name or path suffix', () => {
    expect(findFormReferenceDoc(testReferences, docs, 'deploy.form.md')).toBe(docs[0])
    expect(findFormReferenceDoc(testReferences, docs, 'skills/x/deploy.form.md')).toBe(
      docs[0],
    )
  })

  it('returns undefined when no match', () => {
    expect(findFormReferenceDoc(testReferences, docs, 'missing')).toBeUndefined()
  })
})

describe('referenceDocIsCollectFormSchemaDoc', () => {
  it('detects form schema docs by .form.md suffix', () => {
    const doc = new ReferenceDoc('hitl/step.form.md')
    expect(
      referenceDocIsCollectFormSchemaDoc(testReferences, doc, {} as never),
    ).toBe(true)
  })

  it('detects form paths under any skill-configured form_dir', () => {
    vi.mocked(resolveFormAttachmentDirsForSkill).mockReturnValue(['hitl', 'form'])
    expect(
      referenceDocIsCollectFormSchemaDoc(
        testReferences,
        new ReferenceDoc('form/gate.md'),
        {} as never,
        'my-skill',
      ),
    ).toBe(true)
    expect(
      referenceDocIsCollectFormSchemaDoc(
        testReferences,
        new ReferenceDoc('hitl/gate.md'),
        {} as never,
        'my-skill',
      ),
    ).toBe(true)
    expect(resolveFormAttachmentDirsForSkill).toHaveBeenCalledWith('my-skill')
  })
})
