import type { ReferenceContext } from '../resources/context'
import type { PlanningResult, ReferenceDoc, ReferenceScript } from '../types'
import type { SandboxPlanningAccess } from './types'

export async function materializePlanningSandboxReferences(
  references: ReferenceContext,
  sandbox: SandboxPlanningAccess,
  plan: PlanningResult,
  skillId?: string,
): Promise<void> {
  const docKey = (d: ReferenceDoc) =>
    references.referenceLocationString(d).trim().toLowerCase()
  const flatDocs: ReferenceDoc[] = []
  const seenDocKeys = new Set<string>()
  for (const t of plan.todoList) {
    for (const d of t.reference_doc ?? []) {
      const k = docKey(d)
      const loc = references.referenceLocationString(d)
      if (!loc.trim()) continue
      if (seenDocKeys.has(k)) continue
      seenDocKeys.add(k)
      flatDocs.push(d)
    }
  }
  const copiedDocs = await sandbox.copyReferenceDocs(flatDocs, skillId)
  const docCopyByKey = new Map<string, ReferenceDoc>()
  flatDocs.forEach((d, i) => docCopyByKey.set(docKey(d), copiedDocs[i]))

  const scriptKey = (s: ReferenceScript) =>
    `${s.script_type}|${references.referenceLocationString(s)}`
  const flatScripts: ReferenceScript[] = []
  const seenScriptKeys = new Set<string>()
  for (const t of plan.todoList) {
    for (const s of t.reference_scripts ?? []) {
      const k = scriptKey(s)
      const loc = references.referenceLocationString(s)
      if (!loc.trim()) continue
      if (seenScriptKeys.has(k)) continue
      seenScriptKeys.add(k)
      flatScripts.push(s)
    }
  }
  const copiedScripts = await sandbox.copyReferenceScripts(
    flatScripts,
    skillId,
  )
  const scriptCopyByKey = new Map<string, ReferenceScript>()
  flatScripts.forEach((s, i) =>
    scriptCopyByKey.set(scriptKey(s), copiedScripts[i]),
  )

  for (const t of plan.todoList) {
    if (t.reference_doc?.length) {
      t.reference_doc = t.reference_doc.map(
        (d) => docCopyByKey.get(docKey(d)) ?? d,
      )
    }
    if (t.reference_scripts?.length) {
      t.reference_scripts = t.reference_scripts.map(
        (s) => scriptCopyByKey.get(scriptKey(s)) ?? s,
      )
    }
  }
}
