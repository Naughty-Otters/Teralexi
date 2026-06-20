import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import {
  isRemoteReferenceUrl,
  normalizeReferenceScriptType,
  resolveReferenceUrlToFilesystemPath,
} from './reference-ops'

export type ReferenceLoadContext = {
  /** Sandbox root (cwd for tools); used to resolve relative `reference_url` values. */
  sandboxRoot: string
  abortSignal?: AbortSignal
  /** Upper bound for remote fetch when no `abortSignal` is passed. Default 30s. */
  fetchTimeoutMs?: number
}

export type ReferenceLoadResult =
  | { ok: true; body: string; resolvedFrom: 'local' | 'remote' }
  | { ok: false; error: string }

export abstract class ReferenceResource {
  readonly reference_url: string

  constructor(reference_url: string) {
    this.reference_url = reference_url.trim()
  }

  /** Back-compat: same value as `reference_url` (historical JSON used `path`). */
  get path(): string {
    return this.reference_url
  }

  async loadContent(ctx: ReferenceLoadContext): Promise<ReferenceLoadResult> {
    const url = this.reference_url.trim()
    if (!url) return { ok: false, error: 'Empty reference_url' }

    if (isRemoteReferenceUrl(url)) {
      return this.loadRemote(url, ctx)
    }

    try {
      const fsPath = resolveReferenceUrlToFilesystemPath(url, ctx.sandboxRoot)
      if (!existsSync(fsPath)) {
        return { ok: false, error: `File not found: ${fsPath}` }
      }
      const body = await readFile(fsPath, 'utf-8')
      return { ok: true, body, resolvedFrom: 'local' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  private async loadRemote(
    url: string,
    ctx: ReferenceLoadContext,
  ): Promise<ReferenceLoadResult> {
    const ms = ctx.fetchTimeoutMs ?? 30_000
    let signal: AbortSignal
    if (ctx.abortSignal) {
      try {
        signal = AbortSignal.any([
          ctx.abortSignal,
          AbortSignal.timeout(ms),
        ] as AbortSignal[])
      } catch {
        signal = ctx.abortSignal
      }
    } else {
      signal = AbortSignal.timeout(ms)
    }

    try {
      const res = await fetch(url, { signal, redirect: 'follow' })
      if (!res.ok) {
        return {
          ok: false,
          error: `HTTP ${res.status} ${res.statusText}`,
        }
      }
      const ct = (res.headers.get('content-type') ?? '').toLowerCase()
      if (ct.includes('application/json')) {
        const j: unknown = await res.json()
        return {
          ok: true,
          body: JSON.stringify(j, null, 2),
          resolvedFrom: 'remote',
        }
      }
      const body = await res.text()
      return { ok: true, body, resolvedFrom: 'remote' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
}

export class ReferenceDoc extends ReferenceResource {
  constructor(reference_url: string) {
    super(reference_url)
  }

  static fromPlain(input: {
    name?: string
    path?: string
    reference_url?: string
  }): ReferenceDoc {
    const reference_url = (
      input.reference_url ??
      input.path ??
      input.name ??
      ''
    ).trim()
    return new ReferenceDoc(reference_url)
  }

  toJSON(): { reference_url: string } {
    return { reference_url: this.reference_url }
  }
}

export class ReferenceScript extends ReferenceResource {
  readonly script_type: 'python' | 'node' | 'bash'

  constructor(script_type: 'python' | 'node' | 'bash', reference_url: string) {
    super(reference_url)
    this.script_type = script_type
  }

  static fromPlain(input: {
    script_type?: string
    path?: string
    reference_url?: string
  }): ReferenceScript {
    const reference_url = (
      input.reference_url ??
      input.path ??
      ''
    ).trim()
    const script_type = normalizeReferenceScriptType(input.script_type)
    return new ReferenceScript(script_type, reference_url)
  }

  toJSON(): {
    script_type: 'python' | 'node' | 'bash'
    reference_url: string
  } {
    return { script_type: this.script_type, reference_url: this.reference_url }
  }
}
