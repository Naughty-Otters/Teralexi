import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type Highlighter,
} from 'shiki'

export const SHIKI_THEMES = ['github-light', 'github-dark'] as const satisfies readonly BundledTheme[]

export type ShikiThemeId = (typeof SHIKI_THEMES)[number]

const SHIKI_LANGS = [
  'bash',
  'css',
  'diff',
  'html',
  'javascript',
  'json',
  'jsonc',
  'markdown',
  'python',
  'scss',
  'shell',
  'text',
  'tsx',
  'typescript',
  'vue',
  'yaml',
] as const satisfies readonly BundledLanguage[]

export type ShikiLangId = (typeof SHIKI_LANGS)[number]

let highlighterPromise: Promise<Highlighter> | null = null

export function resetShikiHighlighterForTests(): void {
  highlighterPromise = null
}

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...SHIKI_THEMES],
      langs: [...SHIKI_LANGS],
    })
  }
  return highlighterPromise
}

export function shikiThemeForColorMode(isDark: boolean): ShikiThemeId {
  return isDark ? 'github-dark' : 'github-light'
}

export function normalizeShikiLanguage(lang: string | undefined): ShikiLangId {
  const id = (lang ?? 'text').trim().toLowerCase()
  if ((SHIKI_LANGS as readonly string[]).includes(id)) {
    return id as ShikiLangId
  }
  if (id === 'sh' || id === 'zsh' || id === 'fish') return 'bash'
  if (id === 'js' || id === 'mjs' || id === 'cjs') return 'javascript'
  if (id === 'ts' || id === 'mts' || id === 'cts') return 'typescript'
  if (id === 'md' || id === 'mdx') return 'markdown'
  if (id === 'yml') return 'yaml'
  if (id === 'plaintext' || id === 'txt' || id === 'log') return 'text'
  return 'text'
}

export async function codeToHtml(
  code: string,
  language: string | undefined,
  isDark: boolean,
): Promise<string> {
  const highlighter = await getHighlighter()
  const lang = normalizeShikiLanguage(language)
  const theme = shikiThemeForColorMode(isDark)
  try {
    return highlighter.codeToHtml(code, { lang, theme })
  } catch {
    return highlighter.codeToHtml(code, { lang: 'text', theme })
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
