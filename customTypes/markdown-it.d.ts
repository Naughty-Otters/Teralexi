declare module 'markdown-it' {
  interface MarkdownItOptions {
    html?: boolean
    breaks?: boolean
    linkify?: boolean
    typographer?: boolean
  }

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions)
    render(src: string): string
  }
}
