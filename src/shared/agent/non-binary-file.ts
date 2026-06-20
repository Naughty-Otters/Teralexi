const BINARY_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.svg',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.tgz',
  '.7z',
  '.rar',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.wav',
  '.flac',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.sqlite',
  '.db',
])

export function filePathExtension(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').split('?')[0]?.split('#')[0] ?? ''
  const idx = normalized.lastIndexOf('.')
  if (idx <= 0 || idx === normalized.length - 1) return ''
  return normalized.slice(idx).toLowerCase()
}

export function isLikelyBinaryFilePath(filePath: string): boolean {
  const ext = filePathExtension(filePath)
  if (!ext) return false
  return BINARY_FILE_EXTENSIONS.has(ext)
}
