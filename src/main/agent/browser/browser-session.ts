import { BrowserWindow } from 'electron'
import { createLogger } from '@main/logger'
import { webContentSend } from '@main/services/web-content-send'
import {
  ensureSandboxOutputView,
  getSandboxOutputView,
  loadUrlInSandboxOutputView,
} from '../sandbox/output-view'

const log = createLogger('agent.browser.session')

export type BrowserSelectedElement = {
  ref: string
  tag: string
  id?: string
  className?: string
  text?: string
  testId?: string
  selector: string
  htmlSnippet: string
  styles: Record<string, string>
  bounds: { x: number; y: number; width: number; height: number }
}

export type BrowserSessionState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  inspectMode: boolean
  selected: BrowserSelectedElement | null
}

const inspectModeByWindow = new Map<number, boolean>()
const selectedByWindow = new Map<number, BrowserSelectedElement | null>()
let cdpEndpointHint: string | null = null

function resolveTargetWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  return all[0] ?? null
}

function ensurePreviewPanelOpen(win: BrowserWindow, url: string): void {
  if (win.webContents.isDestroyed()) return
  try {
    webContentSend.OpenSandboxPreview(win.webContents, { fileUrl: url })
  } catch (err) {
    log.warn('Failed to open preview panel for browser session', { err })
  }
}

const SNAPSHOT_SCRIPT = `(() => {
  const interactive = 'a,button,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"]';
  const nodes = Array.from(document.querySelectorAll(interactive));
  const lines = [];
  let n = 0;
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    n += 1;
    const ref = 'e' + n;
    el.setAttribute('data-openfde-ref', ref);
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
    lines.push('- ' + role + (text ? ' "' + text.replace(/"/g, "'") + '"' : '') + (href ? ' url=' + href : '') + ' [ref=' + ref + ']');
    if (lines.length >= 250) break;
  }
  return {
    url: location.href,
    title: document.title || '',
    snapshot: 'Page: ' + (document.title || location.href) + '\\nURL: ' + location.href + '\\n\\n' + lines.join('\\n'),
  };
})()`

const CLICK_SCRIPT = (ref: string) => `(() => {
  const el = document.querySelector('[data-openfde-ref="${ref.replace(/"/g, '')}"]');
  if (!el) return { ok: false, error: 'Element not found: ${ref}' };
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  if (typeof el.click === 'function') el.click();
  return { ok: true, ref: '${ref}' };
})()`

const FILL_SCRIPT = (ref: string, value: string) => {
  const escaped = JSON.stringify(value)
  return `(() => {
  const el = document.querySelector('[data-openfde-ref="${ref.replace(/"/g, '')}"]');
  if (!el) return { ok: false, error: 'Element not found: ${ref}' };
  el.focus();
  if ('value' in el) {
    const proto = Object.getOwnPropertyDescriptor(el.__proto__, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (proto && proto.set) proto.set.call(el, ${escaped});
    else el.value = ${escaped};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = ${escaped};
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { ok: true, ref: '${ref}' };
})()`
}

const INSPECT_SCRIPT = `(() => {
  if (window.__openfdeInspectInstalled) return true;
  window.__openfdeInspectInstalled = true;
  window.__openfdeSelected = null;
  let hover = null;
  const style = document.createElement('style');
  style.textContent = '.__openfde-hover{outline:2px solid #2563eb!important;outline-offset:1px;}.__openfde-selected{outline:2px solid #dc2626!important;outline-offset:1px;}';
  document.documentElement.appendChild(style);
  const pickStyles = (el) => {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      margin: cs.margin,
      padding: cs.padding,
      border: cs.border,
      width: cs.width,
      height: cs.height,
    };
  };
  const describe = (el) => {
    const ref = el.getAttribute('data-openfde-ref') || '';
    const r = el.getBoundingClientRect();
    const id = el.id || undefined;
    const className = typeof el.className === 'string' ? el.className : undefined;
    const testId = el.getAttribute('data-testid') || undefined;
    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
    let selector = el.tagName.toLowerCase();
    if (id) selector += '#' + CSS.escape(id);
    else if (testId) selector += '[data-testid="' + testId + '"]';
    else if (className) selector += '.' + className.trim().split(/\\s+/).slice(0, 2).map((c) => CSS.escape(c)).join('.');
    return {
      ref,
      tag: el.tagName.toLowerCase(),
      id,
      className,
      text,
      testId,
      selector,
      htmlSnippet: el.outerHTML.slice(0, 500),
      styles: pickStyles(el),
      bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  };
  document.addEventListener('mousemove', (ev) => {
    if (!window.__openfdeInspectMode) return;
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return;
    if (hover && hover !== el) hover.classList.remove('__openfde-hover');
    hover = el;
    el.classList.add('__openfde-hover');
  }, true);
  document.addEventListener('click', (ev) => {
    if (!window.__openfdeInspectMode) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return;
    document.querySelectorAll('.__openfde-selected').forEach((n) => n.classList.remove('__openfde-selected'));
    el.classList.add('__openfde-selected');
    window.__openfdeSelected = describe(el);
  }, true);
  return true;
})()`

export function getBrowserCdpEndpointHint(): string | null {
  return cdpEndpointHint
}

export function setBrowserCdpEndpointHint(endpoint: string | null): void {
  cdpEndpointHint = endpoint?.trim() || null
}

export async function browserNavigate(url: string): Promise<{
  ok: boolean
  url: string
  title: string
  error?: string
}> {
  const win = resolveTargetWindow()
  if (!win) {
    return { ok: false, url: '', title: '', error: 'No application window available.' }
  }
  const target = /^https?:\/\//i.test(url.trim())
    ? url.trim()
    : `https://${url.trim()}`
  try {
    ensurePreviewPanelOpen(win, target)
    await loadUrlInSandboxOutputView(win, target)
    const view = getSandboxOutputView(win)
    const title = view && !view.webContents.isDestroyed()
      ? view.webContents.getTitle()
      : ''
    const loaded = view && !view.webContents.isDestroyed()
      ? view.webContents.getURL()
      : target
    return { ok: true, url: loaded || target, title }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, url: target, title: '', error: message }
  }
}

export async function browserSnapshot(): Promise<{
  ok: boolean
  url: string
  title: string
  snapshot: string
  error?: string
}> {
  const win = resolveTargetWindow()
  if (!win) {
    return {
      ok: false,
      url: '',
      title: '',
      snapshot: '',
      error: 'No application window available.',
    }
  }
  const view = ensureSandboxOutputView(win)
  if (view.webContents.isDestroyed()) {
    return { ok: false, url: '', title: '', snapshot: '', error: 'Browser view destroyed.' }
  }
  try {
    const result = (await view.webContents.executeJavaScript(
      SNAPSHOT_SCRIPT,
      true,
    )) as { url: string; title: string; snapshot: string }
    return { ok: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, url: '', title: '', snapshot: '', error: message }
  }
}

export async function browserClick(ref: string): Promise<{
  ok: boolean
  error?: string
}> {
  const win = resolveTargetWindow()
  if (!win) return { ok: false, error: 'No application window available.' }
  const view = getSandboxOutputView(win) ?? ensureSandboxOutputView(win)
  try {
    return (await view.webContents.executeJavaScript(
      CLICK_SCRIPT(ref.trim()),
      true,
    )) as { ok: boolean; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function browserFill(
  ref: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  const win = resolveTargetWindow()
  if (!win) return { ok: false, error: 'No application window available.' }
  const view = getSandboxOutputView(win) ?? ensureSandboxOutputView(win)
  try {
    return (await view.webContents.executeJavaScript(
      FILL_SCRIPT(ref.trim(), value),
      true,
    )) as { ok: boolean; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function browserTabs(): Promise<{
  ok: boolean
  tabs: Array<{ url: string; title: string; active: boolean }>
}> {
  const win = resolveTargetWindow()
  if (!win) return { ok: false, tabs: [] }
  const view = getSandboxOutputView(win)
  if (!view || view.webContents.isDestroyed()) {
    return { ok: true, tabs: [] }
  }
  return {
    ok: true,
    tabs: [
      {
        url: view.webContents.getURL(),
        title: view.webContents.getTitle(),
        active: true,
      },
    ],
  }
}

export async function setBrowserInspectMode(
  enabled: boolean,
): Promise<BrowserSessionState> {
  const win = resolveTargetWindow()
  if (!win) {
    return {
      url: '',
      title: '',
      canGoBack: false,
      canGoForward: false,
      inspectMode: false,
      selected: null,
    }
  }
  inspectModeByWindow.set(win.id, enabled)
  const view = ensureSandboxOutputView(win)
  if (!view.webContents.isDestroyed()) {
    await view.webContents.executeJavaScript(INSPECT_SCRIPT, true)
    await view.webContents.executeJavaScript(
      `window.__openfdeInspectMode = ${enabled ? 'true' : 'false'}; true`,
      true,
    )
  }
  return getBrowserSessionState()
}

export async function pollBrowserSelection(): Promise<BrowserSelectedElement | null> {
  const win = resolveTargetWindow()
  if (!win) return null
  const view = getSandboxOutputView(win)
  if (!view || view.webContents.isDestroyed()) return null
  try {
    const selected = (await view.webContents.executeJavaScript(
      `window.__openfdeSelected || null`,
      true,
    )) as BrowserSelectedElement | null
    selectedByWindow.set(win.id, selected)
    return selected
  } catch {
    return selectedByWindow.get(win.id) ?? null
  }
}

export function getBrowserSessionState(): BrowserSessionState {
  const win = resolveTargetWindow()
  if (!win) {
    return {
      url: '',
      title: '',
      canGoBack: false,
      canGoForward: false,
      inspectMode: false,
      selected: null,
    }
  }
  const view = getSandboxOutputView(win)
  if (!view || view.webContents.isDestroyed()) {
    return {
      url: '',
      title: '',
      canGoBack: false,
      canGoForward: false,
      inspectMode: inspectModeByWindow.get(win.id) === true,
      selected: selectedByWindow.get(win.id) ?? null,
    }
  }
  const history = view.webContents.navigationHistory
  return {
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    canGoBack: Boolean(history?.canGoBack?.()),
    canGoForward: Boolean(history?.canGoForward?.()),
    inspectMode: inspectModeByWindow.get(win.id) === true,
    selected: selectedByWindow.get(win.id) ?? null,
  }
}

/** Build search keys for find-in-code from a selected DOM node. */
export function searchKeysFromSelectedElement(
  selected: BrowserSelectedElement,
): string[] {
  const keys: string[] = []
  if (selected.testId) keys.push(selected.testId)
  if (selected.id) keys.push(selected.id)
  if (selected.className) {
    for (const part of selected.className.split(/\s+/).filter(Boolean).slice(0, 3)) {
      keys.push(part)
    }
  }
  if (selected.text && selected.text.length >= 4 && selected.text.length <= 60) {
    keys.push(selected.text)
  }
  keys.push(selected.tag)
  return [...new Set(keys)]
}
