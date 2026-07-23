/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useImperativePlainPre } from './useImperativePlainPre'

describe('useImperativePlainPre', () => {
  it('creates a real <pre> under the host updated only via textContent', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const hostEl = ref<HTMLElement | null>(host)

    const scope = effectScope()
    const api = scope.run(() =>
      useImperativePlainPre({
        hostEl,
        className: 'reasoning-bubble__body',
      }),
    )
    expect(api).toBeTruthy()

    api!.setText('hello')
    await nextTick()

    const pre = api!.getPre()
    expect(pre).toBeTruthy()
    expect(pre?.tagName).toBe('PRE')
    expect(pre?.className).toBe('reasoning-bubble__body')
    expect(pre?.textContent).toBe('hello')
    expect(host.contains(pre!)).toBe(true)
    expect(host.childNodes.length).toBe(1)

    api!.setText('hello world')
    expect(pre?.textContent).toBe('hello world')

    scope.stop()
    host.remove()
  })
})
