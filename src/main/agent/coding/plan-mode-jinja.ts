/**
 * Minimal Jinja2-compatible renderer for plan markdown templates.
 * Supports {{ var }}, {% for x in items %}, {% if %}/{% else %}/{% endif %},
 * and loop.index (1-based).
 */

type JinjaContext = Record<string, unknown>

function resolvePath(ctx: JinjaContext, path: string): unknown {
  const parts = path.trim().split('.')
  let cur: unknown = ctx
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function interpolate(text: string, ctx: JinjaContext): string {
  return text.replace(/\{\{-?\s*([^}]+?)\s*-?\}\}/g, (_, rawPath: string) => {
    const value = resolvePath(ctx, rawPath.trim())
    return value == null ? '' : String(value)
  })
}

function evalCondition(expr: string, ctx: JinjaContext): boolean {
  const trimmed = expr.trim()
  const neMatch = trimmed.match(/^([\w.]+)\s*!=\s*['"]([^'"]*)['"]$/)
  if (neMatch) {
    return String(resolvePath(ctx, neMatch[1]!)) !== neMatch[2]
  }
  const value =
    trimmed.includes('.') || !(trimmed in ctx)
      ? resolvePath(ctx, trimmed)
      : ctx[trimmed]
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

function stripTrailingNewlineIfTagHadDash(tag: string): boolean {
  return tag.trimEnd().endsWith('-')
}

type TagBlock = {
  body: string
  elseBody: string | null
  after: number
}

function findForBlock(template: string, bodyStart: number): TagBlock {
  let depth = 1
  let pos = bodyStart
  let elseBody: string | null = null
  let elseStart = -1

  while (pos < template.length) {
    const tagStart = template.indexOf('{%', pos)
    if (tagStart === -1) break
    const tagEnd = template.indexOf('%}', tagStart)
    if (tagEnd === -1) break
    const tag = template.slice(tagStart + 2, tagEnd).trim().replace(/\s*-$/, '')

    if (tag === 'endfor') {
      depth -= 1
      if (depth === 0) {
        const bodyEnd = elseStart >= 0 ? elseStart : tagStart
        return {
          body: template.slice(bodyStart, bodyEnd),
          elseBody,
          after: tagEnd + 2,
        }
      }
    } else if (tag.startsWith('for ')) {
      depth += 1
    }
    pos = tagEnd + 2
  }

  throw new Error('Unclosed {% for %} block')
}

function findIfBlock(template: string, bodyStart: number): TagBlock {
  let depth = 1
  let pos = bodyStart
  let elseAt = -1

  while (pos < template.length) {
    const tagStart = template.indexOf('{%', pos)
    if (tagStart === -1) break
    const tagEnd = template.indexOf('%}', tagStart)
    if (tagEnd === -1) break
    const rawTag = template.slice(tagStart + 2, tagEnd)
    const tag = rawTag.trim().replace(/\s*-$/, '')

    if (tag === 'endif') {
      depth -= 1
      if (depth === 0) {
        if (elseAt >= 0) {
          const elseTagEnd = template.indexOf('%}', elseAt)
          return {
            body: template.slice(bodyStart, elseAt),
            elseBody: template.slice(elseTagEnd + 2, tagStart),
            after: tagEnd + 2,
          }
        }
        return {
          body: template.slice(bodyStart, tagStart),
          elseBody: null,
          after: tagEnd + 2,
        }
      }
    } else if (tag === 'else' && depth === 1 && elseAt < 0) {
      elseAt = tagStart
    } else if (tag.startsWith('if ')) {
      depth += 1
    }
    pos = tagEnd + 2
  }

  throw new Error('Unclosed {% if %} block')
}

function renderBlock(template: string, ctx: JinjaContext): string {
  let out = ''
  let i = 0

  while (i < template.length) {
    const tagStart = template.indexOf('{%', i)
    if (tagStart === -1) {
      out += interpolate(template.slice(i), ctx)
      break
    }

    out += interpolate(template.slice(i, tagStart), ctx)
    const tagEnd = template.indexOf('%}', tagStart)
    if (tagEnd === -1) {
      throw new Error('Unclosed Jinja tag')
    }

    const rawTag = template.slice(tagStart + 2, tagEnd)
    const tag = rawTag.trim().replace(/\s*-$/, '')
    const trimAfter = stripTrailingNewlineIfTagHadDash(rawTag)
    const bodyStart = tagEnd + 2

    if (tag.startsWith('for ')) {
      const match = tag.match(/^for\s+(\w+)\s+in\s+(\S+)$/)
      if (!match) throw new Error(`Invalid for tag: ${tag}`)
      const [, itemName, listPath] = match
      const block = findForBlock(template, bodyStart)
      const list = resolvePath(ctx, listPath!)
      if (Array.isArray(list)) {
        for (let idx = 0; idx < list.length; idx++) {
          const itemCtx: JinjaContext = {
            ...ctx,
            [itemName!]: list[idx],
            loop: { index: idx + 1 },
          }
          out += renderBlock(block.body, itemCtx)
        }
      }
      i = block.after
      if (trimAfter && template[i] === '\n') i += 1
      continue
    }

    if (tag.startsWith('if ')) {
      const condition = tag.slice(3).trim()
      const block = findIfBlock(template, bodyStart)
      const branch = evalCondition(condition, ctx)
        ? block.body
        : (block.elseBody ?? '')
      out += renderBlock(branch, ctx)
      i = block.after
      if (trimAfter && template[i] === '\n') i += 1
      continue
    }

    if (tag === 'endif' || tag === 'endfor' || tag === 'else') {
      break
    }

    throw new Error(`Unsupported Jinja tag: ${tag}`)
  }

  return out
}

/** Render a Jinja2-style template string with the given context. */
export function renderJinja2(template: string, context: JinjaContext): string {
  return renderBlock(template, context)
}
