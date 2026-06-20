const EXTENSION_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  md: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  patch: 'diff',
  diff: 'diff',
}

export function languageFromFilePath(filePath: string | undefined): string {
  if (!filePath?.trim()) return 'diff'
  const base = filePath.split(/[/\\]/).pop() ?? filePath
  const dot = base.lastIndexOf('.')
  if (dot <= 0) {
    if (base.toLowerCase() === 'dockerfile') return 'dockerfile'
    if (base.toLowerCase() === 'makefile') return 'makefile'
    return 'diff'
  }
  const ext = base.slice(dot + 1).toLowerCase()
  return EXTENSION_LANG[ext] ?? 'diff'
}

export function languageForTerminalSlot(
  slot: 'command' | 'output' | 'error',
): string {
  if (slot === 'command') return 'bash'
  if (slot === 'error') return 'text'
  return 'text'
}

export function guessLanguageFromCode(
  code: string,
  fallback = 'text',
): string {
  const trimmed = code.trim()
  if (!trimmed) return fallback
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      /* not json */
    }
  }
  if (trimmed.startsWith('#!/')) return 'bash'
  return fallback
}
