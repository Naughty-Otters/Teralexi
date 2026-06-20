import { createHash } from 'crypto'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { jsonrepair } from 'jsonrepair'
import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import { loadAgentRunCredentials } from '@main/agent/utils'
import { createModelForProvider } from '@main/agent/providers/adapters'
import { runLlmTextWithRetry } from '@main/agent/providers/stream'
import { SKILL_FILES } from './constants'
import {
  parseSkillCompiledArtifact,
  SKILL_COMPILE_JSON_SCHEMA_HINT,
  SKILL_COMPILED_VERSION,
  type SkillCompiledArtifact,
  type SkillCompilationSource,
} from './skill-compiled-schema'
import {
  listSkillAttachments,
  readSkillAttachment,
} from './skill-attachments'
import {
  resolvePropertiesRaw,
  resolveSkillCompilationSource,
  resolveSkillFolder,
  extractYamlFrontmatterBlock,
  stripYamlFrontmatter,
} from './skill-path'
import type { SkillProvider } from './types'
import { parseSkillMarkdown } from './skill-markdown'
import {
  formatCompileError,
  logCompileError,
  logTextSnippet,
  shortFingerprint,
} from './skill-compiler-log'
import { loadSkillCompileSettings } from './skill-compile-settings'
import { resolveSkillCompileLlm } from '@shared/agent/skill-compile-settings'

const log = createLogger('skills.compiler')

const MAX_COMPILE_INPUT_CHARS = 120_000
const MAX_ATTACHMENT_CHARS = 12_000
const COMPILE_CONCURRENCY = 2

const COMPILE_SYSTEM = `You are a skill compiler. Read skill.md and distill ONE JSON object matching the schema.

Rules:
- thinking.instructions: short pre-tool-loop intent guidance distilled from skill.md (tone, routing hints — not the full tool list).
- instructions.instructions: full agent tool-loop instructions from skill.md ## Instructions and ## Tools (keep tool usage guidance).
- validation.rules: acceptance criteria and constraints from skill.md (## Constraints, bullet rules in Instructions) as a string array.
- Source everything from skill.md only — do not invent steps or tools not in the skill.
- Do NOT echo full raw attachment bodies in output — summarize paths and rules only.
- Set version to ${SKILL_COMPILED_VERSION}, skillId and sourceFingerprint exactly as provided in the user message.
- Output strict JSON only: no markdown fences, no comments.

Schema:
${SKILL_COMPILE_JSON_SCHEMA_HINT}`

const COMPILE_INVALID_JSON_RETRY =
  'Your previous reply was not valid JSON. Reply with exactly one JSON object only.'

const inFlightBySkill = new Map<string, Promise<SkillCompiledArtifact | null>>()
let compileSlots = 0
const compileQueue: Array<() => void> = []

function acquireCompileSlot(): Promise<void> {
  if (compileSlots < COMPILE_CONCURRENCY) {
    compileSlots += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    compileQueue.push(() => {
      compileSlots += 1
      resolve()
    })
  })
}

function releaseCompileSlot(): void {
  compileSlots = Math.max(0, compileSlots - 1)
  const next = compileQueue.shift()
  if (next) next()
}

function fileFingerprint(path: string): string {
  try {
    const st = statSync(path)
    return `${path}|${st.size}|${st.mtimeMs}`
  } catch {
    return `${path}|missing`
  }
}

export function computeSkillSourceFingerprint(skillId: string): string {
  const folder = resolveSkillFolder(skillId)
  if (!folder) return ''

  const parts: string[] = []
  const markerFiles = [SKILL_FILES.SKILL_MD, SKILL_FILES.PROPERTIES_MD]

  for (const name of markerFiles) {
    const path = join(folder, name)
    if (existsSync(path)) parts.push(fileFingerprint(path))
  }

  for (const att of listSkillAttachments(skillId)) {
    parts.push(fileFingerprint(att.absolutePath))
  }

  parts.sort()
  return createHash('sha256').update(parts.join('\n')).digest('hex')
}

export type SkillCompileGatheredInput = {
  skillId: string
  source: SkillCompilationSource
  folder: string
  fingerprint: string
  propertiesRaw: string
  skillMd: string
  attachmentsText: string
  model: string
  provider: SkillProvider
}

export function gatherSkillCompileInput(
  skillId: string,
): SkillCompileGatheredInput | null {
  const source = resolveSkillCompilationSource(skillId)
  const folder = resolveSkillFolder(skillId)
  if (!source || !folder) {
    log.warn({ skillId }, 'skill compile gather: skill folder not found')
    return null
  }

  let skillMd = readFileSync(join(folder, SKILL_FILES.SKILL_MD), 'utf-8')
  const propertiesRaw = resolvePropertiesRaw(skillId, folder, skillMd)
  if (extractYamlFrontmatterBlock(skillMd)) {
    skillMd = stripYamlFrontmatter(skillMd)
  }
  const preliminary = parseSkillMarkdown(
    skillId,
    folder,
    propertiesRaw,
    skillMd,
    undefined,
    undefined,
  )
  if (!preliminary) {
    log.warn({ skillId, folder, source }, 'skill compile gather: invalid skill markdown')
    return null
  }

  const attachmentSections: string[] = []
  let totalChars = 0
  let attachmentCount = 0
  let binaryAttachmentCount = 0

  for (const att of listSkillAttachments(skillId)) {
    if (totalChars >= MAX_COMPILE_INPUT_CHARS) break
    try {
      const { content, encoding } = readSkillAttachment(
        skillId,
        att.relativePath,
      )
      if (encoding === 'base64') {
        binaryAttachmentCount += 1
        attachmentSections.push(
          `### ${att.relativePath} (binary, ${att.sizeBytes} bytes, omitted)`,
        )
        continue
      }
      attachmentCount += 1
      const clipped =
        content.length > MAX_ATTACHMENT_CHARS
          ? `${content.slice(0, MAX_ATTACHMENT_CHARS)}\n…[truncated]`
          : content
      const section = `### ${att.relativePath}\n${clipped}`
      attachmentSections.push(section)
      totalChars += section.length
    } catch (err) {
      log.warn(
        {
          skillId,
          path: att.relativePath,
          ...formatCompileError(err),
        },
        'skill compile gather: skipped attachment',
      )
    }
  }

  const fingerprint = computeSkillSourceFingerprint(skillId)
  log.info(
    {
      skillId,
      source,
      folder,
      fingerprint: shortFingerprint(fingerprint),
      provider: preliminary.properties.provider,
      model: preliminary.properties.model,
      skillMdChars: skillMd.length,
      textAttachments: attachmentCount,
      binaryAttachments: binaryAttachmentCount,
      compileInputChars: totalChars,
    },
    'skill compile gather: inputs ready',
  )

  return {
    skillId,
    source,
    folder,
    fingerprint,
    propertiesRaw,
    skillMd,
    attachmentsText: attachmentSections.join('\n\n'),
    model: preliminary.properties.model,
    provider: preliminary.properties.provider,
  }
}

function buildCompileUserMessage(input: SkillCompileGatheredInput): string {
  const blocks = [
    `skillId: ${input.skillId}`,
    `source: ${input.source}`,
    `sourceFingerprint: ${input.fingerprint}`,
    '',
    '## properties.md',
    input.propertiesRaw.trim() || '(empty)',
    '',
    '## skill.md',
    clipCompileSection(input.skillMd),
    '',
    '## attachments',
    input.attachmentsText.trim() || '(none)',
  ]
  const joined = blocks.join('\n')
  if (joined.length <= MAX_COMPILE_INPUT_CHARS) return joined
  return `${joined.slice(0, MAX_COMPILE_INPUT_CHARS)}\n…[input truncated]`
}

function clipCompileSection(text: string): string {
  const max = 40_000
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n…[truncated]`
}

function parseCompileJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start < 0) throw new Error('No JSON object in compile response')
  for (let i = text.length - 1; i >= start; i--) {
    if (text[i] !== '}') continue
    const candidate = text.slice(start, i + 1)
    try {
      return JSON.parse(jsonrepair(candidate))
    } catch {
      // scan
    }
  }
  throw new Error('Could not parse compile JSON')
}

async function runCompileLlm(
  input: SkillCompileGatheredInput,
  retryUser?: string,
): Promise<string> {
  const creds = loadAgentRunCredentials()
  const compileSettings = loadSkillCompileSettings()
  const skillProperties = {
    provider: input.provider,
    model: input.model,
  }
  const compileLlm = resolveSkillCompileLlm(
    input.skillId,
    skillProperties,
    compileSettings,
  )
  const model = createModelForProvider(
    compileLlm.provider,
    compileLlm.model,
    creds,
  )

  const userMessage = buildCompileUserMessage(input)
  const messages: Array<{ role: 'user'; content: string }> = [
    { role: 'user', content: userMessage },
  ]
  if (retryUser) {
    messages.push({ role: 'user', content: retryUser })
  }

  const started = Date.now()
  log.info(
    {
      skillId: input.skillId,
      source: input.source,
      skillProvider: input.provider,
      skillModel: input.model,
      compileProvider: compileLlm.provider,
      compileModel: compileLlm.model,
      compileLlmSource: compileLlm.source,
      isRetry: Boolean(retryUser),
      userMessageChars: userMessage.length,
    },
    'skill compile LLM: request start',
  )

  const trimmed = await runLlmTextWithRetry({
    label: 'skillCompile',
    logMeta: {
      skillId: input.skillId,
      source: input.source,
      compileProvider: compileLlm.provider,
      compileModel: compileLlm.model,
      isJsonRepairRetry: Boolean(retryUser),
    },
    streamParams: {
      model,
      system: COMPILE_SYSTEM,
      messages,
      maxOutputTokens: 8192,
    },
  })

  log.info(
    {
      skillId: input.skillId,
      durationMs: Date.now() - started,
      responseChars: trimmed.length,
      isRetry: Boolean(retryUser),
    },
    'skill compile LLM: request complete',
  )

  return trimmed
}

export type CompileSkillOptions = {
  force?: boolean
  /** Test hook: substitute gather without patching ESM bindings. */
  gather?: typeof gatherSkillCompileInput
  /** Test hook: substitute LLM call. */
  runLlm?: typeof runCompileLlm
}

async function compileSkillInternal(
  skillId: string,
  options?: CompileSkillOptions,
): Promise<SkillCompiledArtifact | null> {
  const gather = options?.gather ?? gatherSkillCompileInput
  const runLlm = options?.runLlm ?? runCompileLlm
  const force = !!options?.force
  const gathered = gather(skillId)
  if (!gathered) {
    log.warn({ skillId, force }, 'skill compile: aborted (could not gather inputs)')
    return null
  }

  const store = getConversationStore()
  const existing = store.getSkillCompilation(skillId, gathered.source)

  log.info(
    {
      skillId,
      force,
      source: gathered.source,
      folder: gathered.folder,
      fingerprint: shortFingerprint(gathered.fingerprint),
      existingStatus: existing?.status ?? 'none',
      existingFingerprint: shortFingerprint(existing?.sourceFingerprint ?? ''),
      fingerprintMatch: existing?.sourceFingerprint === gathered.fingerprint,
    },
    'skill compile: start',
  )

  if (
    !force &&
    existing?.status === 'ready' &&
    existing.sourceFingerprint === gathered.fingerprint &&
    existing.compiled
  ) {
    log.info(
      {
        skillId,
        source: gathered.source,
        fingerprint: shortFingerprint(gathered.fingerprint),
        compiledAt: existing.compiledAt,
      },
      'skill compile: using cached artifact (fingerprint unchanged)',
    )
    return existing.compiled
  }

  store.upsertSkillCompilation({
    skillId,
    source: gathered.source,
    sourceFingerprint: gathered.fingerprint,
    status: 'pending',
    compiled: null,
    errorMessage: null,
    compiledAt: null,
  })

  log.debug(
    { skillId, compileSlotsInUse: compileSlots + 1 },
    'skill compile: acquired compile slot',
  )
  await acquireCompileSlot()
  try {
    let raw: string
    try {
      raw = await runLlm(gathered)
    } catch (llmErr) {
      const message =
        llmErr instanceof Error ? llmErr.message : String(llmErr)
      store.upsertSkillCompilation({
        skillId,
        source: gathered.source,
        sourceFingerprint: gathered.fingerprint,
        status: 'failed',
        compiled: null,
        errorMessage: message,
        compiledAt: null,
      })
      logCompileError(log, skillId, 'llm', llmErr, {
        provider: gathered.provider,
        model: gathered.model,
      })
      return null
    }

    let parsed: SkillCompiledArtifact
    try {
      parsed = parseSkillCompiledArtifact(parseCompileJson(raw))
    } catch (firstErr) {
      log.warn(
        {
          skillId,
          ...formatCompileError(firstErr),
          responseSnippet: logTextSnippet(raw),
        },
        'skill compile: JSON parse/validate failed, retrying LLM',
      )
      try {
        raw = await runLlm(gathered, COMPILE_INVALID_JSON_RETRY)
      } catch (retryLlmErr) {
        const message =
          retryLlmErr instanceof Error ? retryLlmErr.message : String(retryLlmErr)
        store.upsertSkillCompilation({
          skillId,
          source: gathered.source,
          sourceFingerprint: gathered.fingerprint,
          status: 'failed',
          compiled: null,
          errorMessage: message,
          compiledAt: null,
        })
        logCompileError(log, skillId, 'llm-retry', retryLlmErr, {
          provider: gathered.provider,
          model: gathered.model,
        })
        return null
      }
      try {
        parsed = parseSkillCompiledArtifact(parseCompileJson(raw))
      } catch (secondErr) {
        const message =
          secondErr instanceof Error ? secondErr.message : String(secondErr)
        store.upsertSkillCompilation({
          skillId,
          source: gathered.source,
          sourceFingerprint: gathered.fingerprint,
          status: 'failed',
          compiled: null,
          errorMessage: message,
          compiledAt: null,
        })
        logCompileError(log, skillId, 'parse-validate', secondErr, {
          firstError: formatCompileError(firstErr),
          responseSnippet: logTextSnippet(raw),
        })
        return null
      }
      log.info({ skillId }, 'skill compile: JSON retry succeeded')
    }

    if (parsed.skillId !== skillId) {
      parsed = { ...parsed, skillId }
    }
    if (parsed.sourceFingerprint !== gathered.fingerprint) {
      parsed = { ...parsed, sourceFingerprint: gathered.fingerprint }
    }

    store.upsertSkillCompilation({
      skillId,
      source: gathered.source,
      sourceFingerprint: gathered.fingerprint,
      status: 'ready',
      compiled: parsed,
      errorMessage: null,
      compiledAt: new Date().toISOString(),
    })
    log.info(
      {
        skillId,
        source: gathered.source,
        fingerprint: shortFingerprint(gathered.fingerprint),
        instructionChars: parsed.instructions.instructions.length,
        validationRuleCount: parsed.validation.rules.length,
        thinkingChars: parsed.thinking.instructions.length,
      },
      'skill compile: success',
    )
    return parsed
  } finally {
    releaseCompileSlot()
    log.debug({ skillId, compileSlotsInUse: compileSlots }, 'skill compile: released compile slot')
  }
}

/** Compile when fingerprint is stale or missing; returns artifact when ready. */
export async function ensureSkillCompiled(
  skillId: string,
): Promise<SkillCompiledArtifact | null> {
  const existing = inFlightBySkill.get(skillId)
  if (existing) {
    log.debug({ skillId }, 'skill compile: joining in-flight compile')
    return existing
  }

  log.debug({ skillId }, 'skill compile: scheduling compile')
  const promise = compileSkillInternal(skillId).finally(() => {
    inFlightBySkill.delete(skillId)
  })
  inFlightBySkill.set(skillId, promise)
  return promise
}

export async function compileSkill(
  skillId: string,
  options?: CompileSkillOptions,
): Promise<SkillCompiledArtifact | null> {
  log.info(
    { skillId, force: !!options?.force },
    'skill compile: compileSkill invoked',
  )
  if (options?.force) {
    return compileSkillInternal(skillId, options)
  }
  return ensureSkillCompiled(skillId)
}
