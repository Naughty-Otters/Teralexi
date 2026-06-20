import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveSkillsSources } from '@main/skills/skill-path'
import type { AgentStepContext } from '../context'
import { savePendingFormExecution } from './pending-state'
import type { ReferenceContext } from '../resources/context'
import { referenceDocBasename } from '../resources/reference-ops'
import { ReferenceDoc } from '../resources/reference-resource'
import type { TodoItem } from '../types'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import {
  referenceUrlLooksLikeForm,
  resolveFormAttachmentDirsForSkill,
} from '@main/skills/skill-attachment-dirs'
import { inferFormValuesFromUserMessage } from './infer-from-user'
import type { TodoFormReadiness } from './todo-form-readiness'
import { resolveCollectFormFromMarkdown } from './schema-resolve'
import {
  GENERATED_FORM_DOC_NAME,
  generateFormSchemaFromContext,
  schemaToFormMarkdown,
} from './generate-form-schema'
import {
  COLLECT_FORM_STEP_ID,
  COLLECT_FORM_STEP_TITLE,
} from '../constants/step-ids'
import { randomShortUuid } from '@shared/utils/short-uuid'

export {
  COLLECT_FORM_STEP_ID,
  COLLECT_FORM_STEP_TITLE,
} from '../constants/step-ids'

export { GENERATED_FORM_DOC_NAME } from './generate-form-schema'

export type ResolvedTodoFormContent = {
  markdown: string
  formDocName: string
  resolvedForm: Awaited<ReturnType<typeof resolveCollectFormFromMarkdown>>
}

const log = createLogger('form.collect-data-step')

function basenamePath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] ?? p
}

/** Resolves `form_doc_name` or infers it when the todo has a single `*.form.md` reference. */
export function resolveFormDocName(
  references: ReferenceContext,
  todoItem: TodoItem,
  reference_doc: ReferenceDoc[],
  skillId?: string,
): string | undefined {
  const explicit = todoItem.form_doc_name?.trim()
  if (explicit) return explicit

  const formDirs = resolveFormAttachmentDirsForSkill(skillId)
  const formDocs = reference_doc.filter((d) => {
    const url = references.referenceLocationString(d)
    const base = referenceDocBasename(url).toLowerCase()
    return base.endsWith('.form.md') || referenceUrlLooksLikeForm(url, formDirs)
  })
  if (formDocs.length !== 1) return undefined
  const only = formDocs[0]!
  return (
    referenceDocBasename(references.referenceLocationString(only)) ||
    basenamePath(references.referenceLocationString(only))
  )
}

/** Match planner `form_doc_name` to a todo `reference_doc` row (basename or path suffix). */
export function findFormReferenceDoc(
  references: ReferenceContext,
  reference_doc: ReferenceDoc[],
  formName: string,
): ReferenceDoc | undefined {
  const key = formName.trim().toLowerCase()
  if (!key) return undefined
  const keyBase = basenamePath(key).toLowerCase()

  for (const raw of reference_doc) {
    const d = references.ensureReferenceDoc(raw as ReferenceDoc)
    const url = references.referenceLocationString(d).toLowerCase()
    const base = referenceDocBasename(url).toLowerCase()
    if (
      base === key ||
      base === keyBase ||
      url === key ||
      url.endsWith(`/${key}`) ||
      url.endsWith(`/${keyBase}`)
    ) {
      return d
    }
  }
  return undefined
}

/**
 * Reference rows used only for HITL form collection — omit from executor system prompts
 * (`REFERENCE MATERIALS`); the UI shows the schema via `data-collect-form-request`.
 */
export function referenceDocIsCollectFormSchemaDoc(
  references: ReferenceContext,
  doc: ReferenceDoc,
  todoItem: TodoItem,
  skillId?: string,
): boolean {
  const d = references.ensureReferenceDoc(doc as ReferenceDoc)
  const url = references.referenceLocationString(d)
  const base = referenceDocBasename(url).toLowerCase()
  const formDirs = resolveFormAttachmentDirsForSkill(skillId)
  if (base.endsWith('.form.md') || referenceUrlLooksLikeForm(url, formDirs)) {
    return true
  }
  const formName = todoItem.form_doc_name?.trim()
  if (!formName) return false
  return findFormReferenceDoc(references, [d], formName) !== undefined
}

async function tryReadUtf8File(absPath: string): Promise<string | null> {
  if (!existsSync(absPath)) return null
  try {
    return await readFile(absPath, 'utf-8')
  } catch {
    return null
  }
}

async function loadFormMarkdown(
  doc: ReferenceDoc,
  ctx: AgentStepContext,
): Promise<string | null> {
  const ref = ctx.references.referenceLocationString(doc).trim()
  if (!ref) {
    log.warn('Empty reference_url for form document load')
    return null
  }

  if (ctx.references.isRemoteReferenceUrl(ref)) {
    const loaded = await doc.loadContent({
      sandboxRoot: ctx.sandbox.getRoot() ?? '/',
      abortSignal: ctx.opts.abortSignal,
    })
    return loaded.ok ? loaded.body : null
  }

  const layout = ctx.sandbox.layout
  const skillId = ctx.opts.skillId?.trim()

  if (layout) {
    const inSandbox = ctx.references.resolveReferenceReadPathInSandbox(
      ref,
      layout,
      skillId,
    )
    if (inSandbox) {
      const body = await tryReadUtf8File(inSandbox)
      if (body != null) return body
    }
  }

  const rel = ref.replace(/^[/\\]+/, '')
  const { bundled, user } = resolveSkillsSources()
  if (skillId) {
    for (const skillsRoot of [user, bundled]) {
      const body = await tryReadUtf8File(join(skillsRoot, skillId, rel))
      if (body != null) return body
    }
  }
  for (const skillsRoot of [user, bundled]) {
    const body = await tryReadUtf8File(join(skillsRoot, rel))
    if (body != null) return body
  }

  log.error('Failed to load form document', {
    reference_url: ref,
    sandboxRoot: layout?.root,
    refsDir: layout?.refsDir,
    skillsDir: layout?.skillsDir,
    skillId,
  })
  return null
}

async function loadGeneratedFormContent(
  ctx: AgentStepContext,
  todoItem: TodoItem,
  formNameHint: string | undefined,
  reason: string,
): Promise<ResolvedTodoFormContent> {
  log.info(reason, {
    todoId: todoItem.id,
    formNameHint,
  })

  let cachedSchema = ctx.generatedFormSchemaByTodoId.get(todoItem.id)
  if (!cachedSchema) {
    cachedSchema = await generateFormSchemaFromContext(ctx, todoItem)
    ctx.generatedFormSchemaByTodoId.set(todoItem.id, cachedSchema)
    log.info('Generated form schema via LLM', {
      todoId: todoItem.id,
      fieldCount: cachedSchema.fields.length,
    })
  }

  const formDocName = todoItem.form_doc_name?.trim() || GENERATED_FORM_DOC_NAME
  const markdown = schemaToFormMarkdown(cachedSchema)
  const resolvedForm = await resolveCollectFormFromMarkdown(markdown, {
    sandboxRoot: ctx.sandbox.getRoot(),
  })
  return { markdown, formDocName, resolvedForm }
}

/**
 * Load a skill `.form.md` when possible; otherwise generate schema via LLM (cached on context).
 */
export async function resolveTodoFormForCollection(
  ctx: AgentStepContext,
  todoItem: TodoItem,
  reference_doc: ReferenceDoc[],
  formName: string | undefined,
): Promise<ResolvedTodoFormContent> {
  const doc = formName
    ? findFormReferenceDoc(ctx.references, reference_doc, formName)
    : undefined

  if (doc?.reference_url?.trim()) {
    const formDocName = referenceDocBasename(doc.reference_url)
    const markdown = await loadFormMarkdown(doc, ctx)
    if (markdown?.trim()) {
      const resolvedForm = await resolveCollectFormFromMarkdown(markdown, {
        sandboxRoot: ctx.sandbox.getRoot(),
      })
      return { markdown, formDocName, resolvedForm }
    }
    return loadGeneratedFormContent(
      ctx,
      todoItem,
      formName,
      'Predefined form empty or unreadable; falling back to LLM-generated schema',
    )
  }

  // Planner named form_doc_name but omitted reference_doc — try skill folder path.
  if (formName?.trim()) {
    const fromSkillFolder = await loadFormMarkdown(
      new ReferenceDoc(formName.trim()),
      ctx,
    )
    if (fromSkillFolder?.trim()) {
      const resolvedForm = await resolveCollectFormFromMarkdown(fromSkillFolder, {
        sandboxRoot: ctx.sandbox.getRoot(),
      })
      return {
        markdown: fromSkillFolder,
        formDocName: referenceDocBasename(formName),
        resolvedForm,
      }
    }
  }

  if (formName) {
    return loadGeneratedFormContent(
      ctx,
      todoItem,
      formName,
      'form_doc_name not found in reference_doc; generating schema via LLM',
    )
  }

  return loadGeneratedFormContent(
    ctx,
    todoItem,
    undefined,
    'No predefined form file; generating schema via LLM',
  )
}

function emitCollectFormRequest(
  ctx: AgentStepContext,
  request: {
    requestId: string
    todoItem: TodoItem
    /** Resolved display name for the form document (basename or 'generated.form.md'). */
    formDocName: string
    title?: string
    message?: string
    fields: Awaited<ReturnType<typeof resolveCollectFormFromMarkdown>>['fields']
    markdown: string
  },
): void {
  const { requestId, todoItem, formDocName, title, message, fields, markdown } = request
  const preview =
    markdown.length > 6000 ? `${markdown.slice(0, 6000)}\n…` : markdown

  const formRequestChunk = {
    type: 'data-collect-form-request' as const,
    id: requestId,
    data: {
      todoId: todoItem.id,
      todoName: todoItem.name,
      formDocName,
      title,
      message,
      fields,
      markdownPreview: preview,
    },
  }
  ctx.opts.onUIMessageChunk?.(formRequestChunk)

  const renderedRequest = `📋 Additional information required before running task ${todoItem.id} (${todoItem.name}).`
  ctx.recordStepOutput(
    COLLECT_FORM_STEP_ID,
    COLLECT_FORM_STEP_TITLE,
    {
      todoId: todoItem.id,
      todoName: todoItem.name,
      formDocName,
      title,
      message,
      fields,
      markdownPreview: preview,
    },
    renderedRequest,
  )

  ctx.emitStepProgress(
    `\n📋 **Additional information required** before running tools for task ${todoItem.id} (${todoItem.name}). Please fill the form in the chat UI.\n\n`,
  )
}

/**
 * Before {@link SkillsToolExecutionStep} runs tools for a todo, optionally pause and ask the
 * UI to submit structured fields described by a skill reference markdown form (`form_doc_name`).
 */
export class CollectFormDataStep {
  constructor(private readonly ctx: AgentStepContext) {
    instrumentInstanceMethods(this, log)
  }

  /**
   * When {@link TodoFormReadiness.collectViaForm} is true and values are not yet collected,
   * emits `data-collect-form-request` and sets {@link AgentFlowContext.hitlAwaitingFormData}.
   *
   * - If `form_doc_name` resolves to a predefined skill file → uses that schema.
   * - Otherwise schema is generated by LLM from the todo context and cached on the context.
   * - Soft collect: tries inference from the latest user message before showing the form UI.
   *
   * @returns `true` if execution must stop until the client submits the form.
   */
  async maybePauseForFormBeforeTodoExecution(params: {
    todoItem: TodoItem
    reference_doc: ReferenceDoc[]
    todoIndexInPlan: number
    readiness: TodoFormReadiness
  }): Promise<boolean> {
    const { todoItem, reference_doc, todoIndexInPlan, readiness } = params

    this.ctx.form.applyCollectFormResponsesToUiMessages()

    if (!readiness.collectViaForm) {
      log.debug('Skipping form collection; readiness says inputs are sufficient', {
        todoId: todoItem.id,
        reason: readiness.reason,
      })
      return false
    }

    // Skip if form values were already collected for this todo.
    const existing = this.ctx.collectedFormByTodoId[todoItem.id]
    if (existing && Object.keys(existing).length > 0) {
      return false
    }

    const formName = resolveFormDocName(
      this.ctx.references,
      todoItem,
      reference_doc,
      this.ctx.opts.skillId,
    )

    log.info('Collecting form input before todo execution', {
      todoId: todoItem.id,
      formNameHint: formName,
      reason: readiness.reason,
    })

    const { markdown, formDocName, resolvedForm } = await resolveTodoFormForCollection(
      this.ctx,
      todoItem,
      reference_doc,
      formName,
    )

    const fields = resolvedForm.fields
    this.ctx.beginStep(COLLECT_FORM_STEP_ID, COLLECT_FORM_STEP_TITLE)

    const seeded = await inferFormValuesFromUserMessage({
      ctx: this.ctx,
      userText: this.ctx.getLatestUserMessageContent(),
      formMarkdown: markdown,
      fields,
    })
    if (seeded) {
      this.ctx.collectedFormByTodoId[todoItem.id] = seeded
      log.info('Form values inferred from user message; skipping form UI', {
        todoId: todoItem.id,
        keys: Object.keys(seeded),
      })
      return false
    }

    const requestId = randomShortUuid()

    // Emit UI form before pending snapshot so the chat always receives the data part.
    emitCollectFormRequest(this.ctx, {
      requestId,
      todoItem,
      formDocName,
      title: resolvedForm.title,
      message: resolvedForm.message,
      fields,
      markdown,
    })

    const saved = savePendingFormExecution(this.ctx, {
      nextTodoIndex: todoIndexInPlan,
      pendingFormRequestId: requestId,
      pendingFormTodoId: todoItem.id,
    })
    if (!saved) {
      log.error(
        'Cannot save form resume state (missing conversationId or assistantMessageId); form shown but submit may not resume',
        {
          conversationId: this.ctx.opts.conversationId,
          assistantMessageId: this.ctx.opts.assistantMessageId,
          todoId: todoItem.id,
        },
      )
    }

    this.ctx.hitlAwaitingFormData = true
    return true
  }
}
