export type FileTypeTone =
  | 'code'
  | 'web'
  | 'markup'
  | 'data'
  | 'config'
  | 'image'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'archive'
  | 'shell'
  | 'video'
  | 'audio'
  | 'default'

export type FileTypePresentation = {
  tone: FileTypeTone
  icon: string
  /** Short human label, e.g. "TypeScript". */
  kindLabel: string
}

type FileTypeRule = {
  tone: FileTypeTone
  icon: string
  kindLabel: string
  extensions: readonly string[]
}

const FILE_TYPE_RULES: readonly FileTypeRule[] = [
  {
    tone: 'code',
    icon: 'i-lucide-file-code-2',
    kindLabel: 'Code',
    extensions: [
      'ts',
      'tsx',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'py',
      'rb',
      'go',
      'rs',
      'java',
      'kt',
      'kts',
      'swift',
      'c',
      'cc',
      'cpp',
      'h',
      'hpp',
      'cs',
      'php',
      'lua',
      'r',
      'scala',
      'clj',
      'ex',
      'exs',
      'zig',
      'dart',
      'm',
      'mm',
      'pl',
      'hs',
      'elm',
      'vue',
    ],
  },
  {
    tone: 'web',
    icon: 'i-lucide-file-braces',
    kindLabel: 'Web',
    extensions: ['html', 'htm', 'css', 'scss', 'sass', 'less', 'svelte', 'astro'],
  },
  {
    tone: 'markup',
    icon: 'i-lucide-file-text',
    kindLabel: 'Document',
    extensions: ['md', 'mdx', 'rst', 'adoc', 'tex', 'txt'],
  },
  {
    tone: 'data',
    icon: 'i-lucide-file-json-2',
    kindLabel: 'Data',
    extensions: ['json', 'jsonc', 'json5', 'yaml', 'yml', 'csv', 'tsv', 'sql', 'sqlite', 'db'],
  },
  {
    tone: 'config',
    icon: 'i-lucide-settings-2',
    kindLabel: 'Config',
    extensions: ['env', 'ini', 'conf', 'cfg', 'properties', 'toml', 'xml'],
  },
  {
    tone: 'image',
    icon: 'i-lucide-file-image',
    kindLabel: 'Image',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'heic'],
  },
  {
    tone: 'pdf',
    icon: 'i-lucide-file-type',
    kindLabel: 'PDF',
    extensions: ['pdf'],
  },
  {
    tone: 'document',
    icon: 'i-lucide-file-text',
    kindLabel: 'Document',
    extensions: ['doc', 'docx', 'rtf', 'odt', 'epub'],
  },
  {
    tone: 'spreadsheet',
    icon: 'i-lucide-file-spreadsheet',
    kindLabel: 'Spreadsheet',
    extensions: ['xls', 'xlsx', 'numbers'],
  },
  {
    tone: 'archive',
    icon: 'i-lucide-file-archive',
    kindLabel: 'Archive',
    extensions: ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz'],
  },
  {
    tone: 'shell',
    icon: 'i-lucide-terminal',
    kindLabel: 'Script',
    extensions: ['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'],
  },
  {
    tone: 'video',
    icon: 'i-lucide-file-video',
    kindLabel: 'Video',
    extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'],
  },
  {
    tone: 'audio',
    icon: 'i-lucide-file-audio',
    kindLabel: 'Audio',
    extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
  },
]

const EXTENSION_LOOKUP = new Map<string, FileTypeRule>()
for (const rule of FILE_TYPE_RULES) {
  for (const ext of rule.extensions) {
    EXTENSION_LOOKUP.set(ext, rule)
  }
}

const DEFAULT_PRESENTATION: FileTypePresentation = {
  tone: 'default',
  icon: 'i-lucide-file',
  kindLabel: 'File',
}

export function fileNameFromPath(pathOrLabel: string): string {
  const normalized = pathOrLabel.replace(/\\/g, '/').trim()
  const segment = normalized.split('/').pop() ?? normalized
  return (segment.split('?')[0] ?? segment).trim()
}

export function extensionFromPath(pathOrLabel: string): string {
  const name = fileNameFromPath(pathOrLabel).toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1)
}

export function resolveFileTypePresentation(
  pathOrLabel: string,
): FileTypePresentation {
  const ext = extensionFromPath(pathOrLabel)
  if (!ext) return DEFAULT_PRESENTATION
  const rule = EXTENSION_LOOKUP.get(ext)
  if (!rule) return DEFAULT_PRESENTATION
  return {
    tone: rule.tone,
    icon: rule.icon,
    kindLabel: rule.kindLabel,
  }
}

export function fileTypePresentationClass(tone: FileTypeTone): string {
  return `file-type-presentation--${tone}`
}

export function attachmentFilePathClass(
  pathOrLabel: string,
  opts?: { deleted?: boolean },
): string[] {
  const { tone } = resolveFileTypePresentation(pathOrLabel)
  const classes = ['attachment-file-path', fileTypePresentationClass(tone)]
  if (opts?.deleted) classes.push('attachment-file-path--deleted')
  return classes
}
