import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DestinationStream } from 'pino'

/** Default max size per log file before rotation (10 MiB). */
export const DEFAULT_MAX_LOG_BYTES = 10 * 1024 * 1024

/** Default number of log files kept (active + archived). */
export const DEFAULT_MAX_LOG_FILES = 5

export type RotatingLogOptions = {
  maxBytes?: number
  maxFiles?: number
}

export function resolveRotatingLogOptions(
  options?: RotatingLogOptions,
): Required<RotatingLogOptions> {
  const envMaxBytes = Number.parseInt(process.env.TERALEXI_LOG_MAX_BYTES ?? '', 10)
  const envMaxFiles = Number.parseInt(process.env.TERALEXI_LOG_MAX_FILES ?? '', 10)

  const maxBytes =
    options?.maxBytes ??
    (Number.isFinite(envMaxBytes) && envMaxBytes > 0
      ? envMaxBytes
      : DEFAULT_MAX_LOG_BYTES)

  const maxFiles =
    options?.maxFiles ??
    (Number.isFinite(envMaxFiles) && envMaxFiles >= 2
      ? envMaxFiles
      : DEFAULT_MAX_LOG_FILES)

  return {
    maxBytes,
    maxFiles: Math.max(2, maxFiles),
  }
}

/** Rotate `file.log` → `file.log.1` → … → delete oldest archive. */
export function rotateLogFiles(filePath: string, maxFiles: number): void {
  if (maxFiles <= 1) return

  const oldest = `${filePath}.${maxFiles - 1}`
  if (existsSync(oldest)) {
    unlinkSync(oldest)
  }

  for (let index = maxFiles - 2; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`
    const target = `${filePath}.${index + 1}`
    if (existsSync(source)) {
      renameSync(source, target)
    }
  }

  if (existsSync(filePath)) {
    renameSync(filePath, `${filePath}.1`)
  }
}

export function shouldRotateLogFile(
  filePath: string,
  maxBytes: number,
): boolean {
  if (!existsSync(filePath)) return false
  try {
    return statSync(filePath).size >= maxBytes
  } catch {
    return false
  }
}

class SyncRotatingFileWriter {
  readonly path: string
  readonly options: Required<RotatingLogOptions>
  fd: number | null = null
  destroyed = false

  constructor(filePath: string, options?: RotatingLogOptions) {
    this.path = filePath
    this.options = resolveRotatingLogOptions(options)
    mkdirSync(dirname(filePath), { recursive: true })
    this.openFile()
  }

  private openFile(): void {
    this.fd = openSync(this.path, 'a')
  }

  private closeFile(): void {
    if (this.fd == null) return
    try {
      closeSync(this.fd)
    } catch {
      /* ignore close errors */
    }
    this.fd = null
  }

  private rotateIfNeeded(): void {
    if (!shouldRotateLogFile(this.path, this.options.maxBytes)) return
    this.closeFile()
    rotateLogFiles(this.path, this.options.maxFiles)
    this.openFile()
  }

  write(data: string | Buffer): void {
    if (this.destroyed) return
    this.rotateIfNeeded()
    if (this.fd == null) this.openFile()
    const chunk = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
    writeSync(this.fd!, chunk)
  }

  flush(): void {
    if (this.destroyed || this.fd == null) return
    try {
      fsyncSync(this.fd)
    } catch {
      /* ignore fsync errors */
    }
  }

  end(): void {
    if (this.destroyed) return
    this.flush()
    this.closeFile()
    this.destroyed = true
  }
}

/** Sync pino file destination that rotates when the active file exceeds maxBytes. */
export function createRotatingPinoFileDestination(
  logFilePath: string,
  options?: RotatingLogOptions,
): DestinationStream {
  const writer = new SyncRotatingFileWriter(logFilePath, options)
  return writer as unknown as DestinationStream
}
