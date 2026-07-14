declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export function gfm(service: TurndownService): void
  export function tables(service: TurndownService): void
  export function strikethrough(service: TurndownService): void
  export function taskListItems(service: TurndownService): void
}

declare module 'adm-zip' {
  class AdmZip {
    constructor(filePathOrBuffer?: string | Buffer)
    addLocalFile(localPath: string, zipPath?: string): void
    addFile(entryName: string, content: Buffer): void
    addLocalFolder(localPath: string, zipPath?: string): void
    toBuffer(): Buffer
    writeZip(targetFileName: string): void
    getEntries(): Array<{ entryName: string; isDirectory: boolean }>
  }
  export default AdmZip
}

declare module 'mustache' {
  const Mustache: {
    render(template: string, view: unknown, partials?: unknown): string
  }
  export default Mustache
}

declare module 'minimist' {
  function minimist(
    args: string[],
    opts?: Record<string, unknown>,
  ): Record<string, unknown>
  export default minimist
}

