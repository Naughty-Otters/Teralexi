import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'
import type {
  LspDocumentSymbol,
  LspLocation,
  LspLocationLink,
  LspRange,
  LspSymbolInformation,
} from './types'

/** LSP SymbolKind (1-based) → human name. */
const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  15: 'string',
  16: 'number',
  17: 'boolean',
  18: 'array',
  19: 'object',
  20: 'key',
  21: 'null',
  22: 'enum-member',
  23: 'struct',
  24: 'event',
  25: 'operator',
  26: 'type-parameter',
}

export function symbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? `kind-${kind}`
}

/** A code location with 1-based, editor-style coordinates and a display path. */
export type DisplayLocation = {
  path: string
  line: number
  character: number
  endLine: number
  endCharacter: number
}

function uriToDisplayPath(uri: string, workspaceRoot: string | null): string {
  let abs: string
  try {
    abs = fileURLToPath(uri)
  } catch {
    return uri
  }
  if (workspaceRoot) {
    const rel = relative(workspaceRoot, abs)
    if (rel && !rel.startsWith('..')) return rel
  }
  return abs
}

function rangeToDisplay(
  uri: string,
  range: LspRange,
  workspaceRoot: string | null,
): DisplayLocation {
  return {
    path: uriToDisplayPath(uri, workspaceRoot),
    line: range.start.line + 1,
    character: range.start.character + 1,
    endLine: range.end.line + 1,
    endCharacter: range.end.character + 1,
  }
}

function isLocationLink(value: unknown): value is LspLocationLink {
  return Boolean(value) && typeof (value as LspLocationLink).targetUri === 'string'
}

function isLocation(value: unknown): value is LspLocation {
  return Boolean(value) && typeof (value as LspLocation).uri === 'string'
}

/**
 * Normalize a definition/references/implementation result — which may be a
 * single Location, a Location[], or a LocationLink[] — into display locations.
 */
export function normalizeLocations(
  result: unknown,
  workspaceRoot: string | null,
): DisplayLocation[] {
  if (!result) return []
  const items = Array.isArray(result) ? result : [result]
  const out: DisplayLocation[] = []
  for (const item of items) {
    if (isLocationLink(item)) {
      out.push(rangeToDisplay(item.targetUri, item.targetRange, workspaceRoot))
    } else if (isLocation(item)) {
      out.push(rangeToDisplay(item.uri, item.range, workspaceRoot))
    }
  }
  return out
}

/** Normalize an LSP Hover result into plain text. */
export function hoverToText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const contents = (result as { contents?: unknown }).contents
  return markedContentToText(contents).trim()
}

function markedContentToText(contents: unknown): string {
  if (contents == null) return ''
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents.map(markedContentToText).filter(Boolean).join('\n\n')
  }
  if (typeof contents === 'object') {
    // MarkupContent { kind, value } or MarkedString { language, value }
    const value = (contents as { value?: unknown }).value
    if (typeof value === 'string') return value
  }
  return ''
}

export type DisplaySymbol = {
  name: string
  kind: string
  line: number
  character: number
  detail?: string
  depth: number
}

/**
 * Normalize a documentSymbol result — hierarchical DocumentSymbol[] or flat
 * SymbolInformation[] — into a depth-tagged flat list with 1-based coordinates.
 */
export function normalizeDocumentSymbols(result: unknown): DisplaySymbol[] {
  if (!Array.isArray(result)) return []
  const out: DisplaySymbol[] = []

  const isHierarchical =
    result.length > 0 && 'range' in (result[0] as object) && !('location' in (result[0] as object))

  if (isHierarchical) {
    const walk = (nodes: LspDocumentSymbol[], depth: number) => {
      for (const node of nodes) {
        const pos = (node.selectionRange ?? node.range).start
        out.push({
          name: node.name,
          kind: symbolKindName(node.kind),
          line: pos.line + 1,
          character: pos.character + 1,
          detail: node.detail?.trim() || undefined,
          depth,
        })
        if (node.children?.length) walk(node.children, depth + 1)
      }
    }
    walk(result as LspDocumentSymbol[], 0)
  } else {
    for (const sym of result as LspSymbolInformation[]) {
      const pos = sym.location.range.start
      out.push({
        name: sym.name,
        kind: symbolKindName(sym.kind),
        line: pos.line + 1,
        character: pos.character + 1,
        detail: sym.containerName?.trim() || undefined,
        depth: 0,
      })
    }
  }
  return out
}

export type DisplayWorkspaceSymbol = {
  name: string
  kind: string
  path: string
  line: number
  character: number
  container?: string
}

/** Normalize a workspace/symbol result into display rows. */
export function normalizeWorkspaceSymbols(
  result: unknown,
  workspaceRoot: string | null,
): DisplayWorkspaceSymbol[] {
  if (!Array.isArray(result)) return []
  const out: DisplayWorkspaceSymbol[] = []
  for (const sym of result as LspSymbolInformation[]) {
    const loc = sym.location
    if (!loc?.uri || !loc.range) continue
    const display = rangeToDisplay(loc.uri, loc.range, workspaceRoot)
    out.push({
      name: sym.name,
      kind: symbolKindName(sym.kind),
      path: display.path,
      line: display.line,
      character: display.character,
      container: sym.containerName?.trim() || undefined,
    })
  }
  return out
}
