import { describe, expect, it, vi } from 'vitest'
import {
  classifyToolFailure,
  applyToolGuardrails,
  ToolGuardrailController,
} from './tool-guardrails'

// ---------------------------------------------------------------------------
// classifyToolFailure
// ---------------------------------------------------------------------------

describe('classifyToolFailure', () => {
  it('returns false for null/undefined', () => {
    expect(classifyToolFailure('read_file', null)).toBe(false)
    expect(classifyToolFailure('read_file', undefined)).toBe(false)
  })

  it('returns true for object with success: false', () => {
    expect(classifyToolFailure('write_file', { success: false, error: 'oops' })).toBe(true)
  })

  it('returns true for object with non-null error field', () => {
    expect(classifyToolFailure('git_commit', { error: 'merge conflict' })).toBe(true)
  })

  it('returns false for object with error: false (not a real error)', () => {
    expect(classifyToolFailure('git_status', { error: false, output: 'clean' })).toBe(false)
  })

  it('returns true for non-zero exit_code', () => {
    expect(classifyToolFailure('run_script', { exit_code: 1, stderr: 'oops' })).toBe(true)
  })

  it('returns false for exit_code: 0', () => {
    expect(classifyToolFailure('run_script', { exit_code: 0, stdout: 'ok' })).toBe(false)
  })

  it('returns true for string starting with Error', () => {
    expect(classifyToolFailure('read_file', 'Error: file not found')).toBe(true)
  })

  it('returns true for JSON string with success: false', () => {
    expect(classifyToolFailure('web_search', '{"success":false,"message":"no results"}')).toBe(true)
  })

  it('returns false for normal string result', () => {
    expect(classifyToolFailure('read_file', '# Hello World\nSome content')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(classifyToolFailure('read_file', '')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ToolGuardrailController — basic allow path
// ---------------------------------------------------------------------------

describe('ToolGuardrailController — happy path', () => {
  it('allows first call', () => {
    const ctrl = new ToolGuardrailController()
    expect(ctrl.beforeCall('read_file', { path: '/foo' }).action).toBe('allow')
    expect(ctrl.afterCall('read_file', { path: '/foo' }, 'content').action).toBe('allow')
  })

  it('allows mutating tool success repeatedly', () => {
    const ctrl = new ToolGuardrailController()
    for (let i = 0; i < 5; i++) {
      ctrl.beforeCall('write_file', { path: '/foo', content: `v${i}` })
      ctrl.afterCall('write_file', { path: '/foo', content: `v${i}` }, { success: true })
    }
    const last = ctrl.afterCall('write_file', { path: '/foo', content: 'vN' }, { success: true })
    expect(last.action).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// Exact-failure warnings and blocks
// ---------------------------------------------------------------------------

describe('ToolGuardrailController — exact failure tracking', () => {
  it('warns after exactFailureWarnAfter identical failures', () => {
    const ctrl = new ToolGuardrailController({ exactFailureWarnAfter: 2 })
    const args = { path: '/missing' }

    ctrl.afterCall('read_file', args, { error: 'not found' })
    const second = ctrl.afterCall('read_file', args, { error: 'not found' })
    expect(second.action).toBe('warn')
    expect(second.code).toBe('repeated_exact_failure_warning')
  })

  it('blocks before call after exactFailureBlockAfter identical failures', () => {
    const ctrl = new ToolGuardrailController({
      exactFailureWarnAfter: 2,
      exactFailureBlockAfter: 3,
    })
    const args = { path: '/missing' }

    ctrl.afterCall('read_file', args, { error: 'e1' })
    ctrl.afterCall('read_file', args, { error: 'e2' })
    ctrl.afterCall('read_file', args, { error: 'e3' })

    const pre = ctrl.beforeCall('read_file', args)
    expect(pre.action).toBe('block')
    expect(pre.code).toBe('repeated_exact_failure_block')
  })

  it('resets exact failure count on success', () => {
    const ctrl = new ToolGuardrailController({ exactFailureWarnAfter: 2 })
    const args = { path: '/file' }

    ctrl.afterCall('read_file', args, { error: 'miss' })
    ctrl.afterCall('read_file', args, 'found!')  // success
    const third = ctrl.afterCall('read_file', args, { error: 'miss' })
    expect(third.action).toBe('allow')
  })

  it('does not warn for different args even if same tool fails', () => {
    const ctrl = new ToolGuardrailController({ exactFailureWarnAfter: 2 })
    ctrl.afterCall('read_file', { path: '/a' }, { error: 'e' })
    const d = ctrl.afterCall('read_file', { path: '/b' }, { error: 'e' })
    expect(d.action).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// Same-tool failure warnings and halts
// ---------------------------------------------------------------------------

describe('ToolGuardrailController — same-tool failure tracking', () => {
  it('warns after sameToolFailureWarnAfter failures across different args', () => {
    const ctrl = new ToolGuardrailController({ sameToolFailureWarnAfter: 3 })
    ctrl.afterCall('run_script', { content: 'a' }, { error: 'e' })
    ctrl.afterCall('run_script', { content: 'b' }, { error: 'e' })
    const third = ctrl.afterCall('run_script', { content: 'c' }, { error: 'e' })
    expect(third.action).toBe('warn')
    expect(third.code).toBe('same_tool_failure_warning')
  })

  it('halts after sameToolFailureHaltAfter failures', () => {
    const ctrl = new ToolGuardrailController({
      sameToolFailureWarnAfter: 2,
      sameToolFailureHaltAfter: 4,
    })
    for (let i = 0; i < 3; i++) {
      ctrl.afterCall('run_script', { content: `v${i}` }, { error: 'fail' })
    }
    const halt = ctrl.afterCall('run_script', { content: 'v4' }, { error: 'fail' })
    expect(halt.action).toBe('halt')
    expect(halt.code).toBe('same_tool_failure_halt')
    expect(ctrl.lastHaltDecision?.action).toBe('halt')
  })

  it('resets same-tool count on success', () => {
    const ctrl = new ToolGuardrailController({ sameToolFailureWarnAfter: 2 })
    ctrl.afterCall('run_script', { content: 'a' }, { error: 'e' })
    ctrl.afterCall('run_script', { content: 'b' }, { success: true }) // success resets
    const d = ctrl.afterCall('run_script', { content: 'c' }, { error: 'e' })
    expect(d.action).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// Idempotent no-progress
// ---------------------------------------------------------------------------

describe('ToolGuardrailController — idempotent no-progress', () => {
  const SAME_RESULT = 'file content unchanged'

  it('warns after noProgressWarnAfter identical results', () => {
    const ctrl = new ToolGuardrailController({ noProgressWarnAfter: 2 })
    const args = { path: '/data.txt' }

    ctrl.afterCall('read_file', args, SAME_RESULT) // count = 1
    const second = ctrl.afterCall('read_file', args, SAME_RESULT) // count = 2
    expect(second.action).toBe('warn')
    expect(second.code).toBe('idempotent_no_progress_warning')
  })

  it('blocks before call after noProgressBlockAfter no-progress repeats', () => {
    const ctrl = new ToolGuardrailController({
      noProgressWarnAfter: 2,
      noProgressBlockAfter: 3,
    })
    const args = { path: '/data.txt' }
    ctrl.afterCall('read_file', args, SAME_RESULT)
    ctrl.afterCall('read_file', args, SAME_RESULT)
    ctrl.afterCall('read_file', args, SAME_RESULT)

    const pre = ctrl.beforeCall('read_file', args)
    expect(pre.action).toBe('block')
    expect(pre.code).toBe('idempotent_no_progress_block')
  })

  it('resets no-progress count when result changes', () => {
    const ctrl = new ToolGuardrailController({ noProgressWarnAfter: 3 })
    const args = { path: '/data.txt' }
    // Build up count to 2 with old result
    ctrl.afterCall('read_file', args, SAME_RESULT)
    ctrl.afterCall('read_file', args, SAME_RESULT)
    // Result changes → count resets to 1 for the new result
    const d = ctrl.afterCall('read_file', args, 'new content')
    // count is now 1, warn threshold is 3 → still allow
    expect(d.action).toBe('allow')
  })

  it('does NOT apply no-progress to mutating tools', () => {
    const ctrl = new ToolGuardrailController({ noProgressWarnAfter: 2 })
    const args = { content: 'data' }
    // run_script is mutating — no-progress tracking should not apply
    ctrl.afterCall('run_script', args, { exit_code: 0, stdout: 'same' })
    const d = ctrl.afterCall('run_script', args, { exit_code: 0, stdout: 'same' })
    expect(d.action).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('ToolGuardrailController — reset', () => {
  it('clears all tracking state', () => {
    const ctrl = new ToolGuardrailController({ exactFailureWarnAfter: 2 })
    const args = { path: '/x' }
    ctrl.afterCall('read_file', args, { error: 'e' })
    ctrl.afterCall('read_file', args, { error: 'e' })
    ctrl.reset()
    const d = ctrl.afterCall('read_file', args, { error: 'e' })
    expect(d.action).toBe('allow') // count reset to 1, warn threshold is 2
  })
})

// ---------------------------------------------------------------------------
// applyToolGuardrails integration
// ---------------------------------------------------------------------------

describe('applyToolGuardrails', () => {
  function makeToolSet(executeFn: (input: unknown) => Promise<unknown>) {
    return {
      my_tool: {
        execute: executeFn,
        description: 'test tool',
      },
    }
  }

  it('passes through successful calls', async () => {
    const toolSet = makeToolSet(async () => ({ success: true, data: 'hello' }))
    const ctrl = new ToolGuardrailController()
    const haltCtrl = new AbortController()
    applyToolGuardrails(toolSet, ctrl, haltCtrl)

    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({ q: 1 })
    expect(result).toEqual({ success: true, data: 'hello' })
    expect(haltCtrl.signal.aborted).toBe(false)
  })

  it('appends warning text on warn decision', async () => {
    const ctrl = new ToolGuardrailController({ exactFailureWarnAfter: 2 })
    // Pre-populate failure counts so the next call triggers warn
    const args = { path: '/fail' }
    ctrl.afterCall('my_tool', args, { error: 'e' })

    const toolSet = makeToolSet(async () => ({ error: 'still failing' }))
    const haltCtrl = new AbortController()
    applyToolGuardrails(toolSet, ctrl, haltCtrl)

    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)(args)
    expect(result).toHaveProperty('_guardrailWarning')
    expect((result as Record<string, unknown>)._guardrailWarning).toContain('Tool loop warning')
  })

  it('returns synthetic error for blocked call (no execute)', async () => {
    const execFn = vi.fn().mockResolvedValue({ success: true })
    const toolSet = makeToolSet(execFn)

    const ctrl = new ToolGuardrailController({
      exactFailureWarnAfter: 1,
      exactFailureBlockAfter: 2,
    })
    const args = { path: '/fail' }
    // Trigger block threshold
    ctrl.afterCall('my_tool', args, { error: 'e' })
    ctrl.afterCall('my_tool', args, { error: 'e' })

    const haltCtrl = new AbortController()
    applyToolGuardrails(toolSet, ctrl, haltCtrl)

    const result = await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)(args)
    expect(result).toHaveProperty('guardrail', 'repeated_exact_failure_block')
    // execute should NOT have been called
    expect(execFn).not.toHaveBeenCalled()
  })

  it('aborts haltCtrl when halt threshold is reached', async () => {
    const ctrl = new ToolGuardrailController({
      sameToolFailureWarnAfter: 1,
      sameToolFailureHaltAfter: 2,
    })
    // Pre-populate to be one below halt
    ctrl.afterCall('my_tool', { a: '1' }, { error: 'e' })

    const toolSet = makeToolSet(async () => ({ error: 'fail again' }))
    const haltCtrl = new AbortController()
    applyToolGuardrails(toolSet, ctrl, haltCtrl)

    await (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({ a: '2' })
    expect(haltCtrl.signal.aborted).toBe(true)
  })

  it('re-throws tool exceptions and still tracks failures', async () => {
    const ctrl = new ToolGuardrailController()
    const toolSet = makeToolSet(async () => { throw new Error('network error') })
    const haltCtrl = new AbortController()
    applyToolGuardrails(toolSet, ctrl, haltCtrl)

    await expect(
      (toolSet.my_tool.execute as (i: unknown) => Promise<unknown>)({ q: 1 }),
    ).rejects.toThrow('network error')
  })
})
