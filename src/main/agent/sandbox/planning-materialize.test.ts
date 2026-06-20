import { describe, expect, it, vi } from 'vitest'
import { materializePlanningSandboxReferences } from './planning-materialize'
import type { PlanningResult } from '../types'
import type { ReferenceContext } from '../resources/context'

describe('materializePlanningSandboxReferences', () => {
  it('deduplicates docs and scripts then rewrites todo references', async () => {
    const docA = { path: 'docs/guide.md' }
    const docDup = { path: 'docs/GUIDE.md' }
    const scriptA = { script_type: 'node', path: 'scripts/run.ts' }

    const plan: PlanningResult = {
      finalGoal: 'goal',
      expectations: [],
      todoList: [
        {
          id: 1,
          name: 't1',
          description: '',
          success_criteria: '',
          fallback_plan: 'retry',
          status: 'pending',
          reference_doc: [docA, docDup],
          reference_scripts: [scriptA, scriptA],
        },
        {
          id: 2,
          name: 't2',
          description: '',
          success_criteria: '',
          fallback_plan: 'retry',
          status: 'pending',
          reference_doc: [docA],
        },
      ],
    }

    const copiedDoc = { path: 'refs/guide.md' }
    const copiedScript = { script_type: 'node', path: 'scripts/run.ts' }

    const sandbox = {
      copyReferenceDocs: vi.fn(async (docs: unknown[]) =>
        docs.length === 1 ? [copiedDoc] : docs.map(() => copiedDoc),
      ),
      copyReferenceScripts: vi.fn(async () => [copiedScript]),
    }

    const references = {
      referenceLocationString: (r: { path?: string; script_type?: string }) =>
        r.path ?? '',
    } as ReferenceContext

    await materializePlanningSandboxReferences(references, sandbox, plan, 'coding')

    expect(sandbox.copyReferenceDocs).toHaveBeenCalledWith([docA], 'coding')
    expect(sandbox.copyReferenceScripts).toHaveBeenCalledWith([scriptA], 'coding')
    expect(plan.todoList[0]?.reference_doc).toEqual([copiedDoc, copiedDoc])
    expect(plan.todoList[0]?.reference_scripts).toEqual([copiedScript, copiedScript])
    expect(plan.todoList[1]?.reference_doc).toEqual([copiedDoc])
  })

  it('skips references with empty locations', async () => {
    const plan: PlanningResult = {
      finalGoal: 'goal',
      expectations: [],
      todoList: [
        {
          id: 1,
          name: 't1',
          description: '',
          success_criteria: '',
          fallback_plan: 'retry',
          status: 'pending',
          reference_doc: [{ path: '   ' }],
          reference_scripts: [{ script_type: 'sh', path: '' }],
        },
      ],
    }

    const sandbox = {
      copyReferenceDocs: vi.fn(async () => []),
      copyReferenceScripts: vi.fn(async () => []),
    }
    const references = {
      referenceLocationString: (r: { path?: string }) => r.path ?? '',
    } as ReferenceContext

    await materializePlanningSandboxReferences(references, sandbox, plan)

    expect(sandbox.copyReferenceDocs).toHaveBeenCalledWith([], undefined)
    expect(sandbox.copyReferenceScripts).toHaveBeenCalledWith([], undefined)
  })
})
