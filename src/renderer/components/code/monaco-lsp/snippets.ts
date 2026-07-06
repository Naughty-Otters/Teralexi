import { monaco } from '../monaco-setup'

type SnippetDef = {
  prefix: string
  body: string[]
  description: string
}

const TYPESCRIPT_SNIPPETS: SnippetDef[] = [
  {
    prefix: 'imp',
    body: ["import { $2 } from '$1';"],
    description: 'Import module',
  },
  {
    prefix: 'fn',
    body: ['function ${1:name}($2) {', '\t$0', '}'],
    description: 'Function declaration',
  },
  {
    prefix: 'afn',
    body: ['async function ${1:name}($2) {', '\t$0', '}'],
    description: 'Async function',
  },
  {
    prefix: 'const',
    body: ['const ${1:name} = $0;'],
    description: 'Const declaration',
  },
]

const PYTHON_SNIPPETS: SnippetDef[] = [
  {
    prefix: 'def',
    body: ['def ${1:name}($2):', '\t$0'],
    description: 'Function definition',
  },
  {
    prefix: 'class',
    body: ['class ${1:Name}:', '\tdef __init__(self$2):', '\t\t$0'],
    description: 'Class definition',
  },
]

const GO_SNIPPETS: SnippetDef[] = [
  {
    prefix: 'func',
    body: ['func ${1:name}($2) ${3:error} {', '\t$0', '}'],
    description: 'Function',
  },
]

const RUST_SNIPPETS: SnippetDef[] = [
  {
    prefix: 'fn',
    body: ['fn ${1:name}($2) {', '\t$0', '}'],
    description: 'Function',
  },
  {
    prefix: 'struct',
    body: ['struct ${1:Name} {', '\t$0', '}'],
    description: 'Struct',
  },
]

const SNIPPET_PACKS: Record<string, SnippetDef[]> = {
  typescript: TYPESCRIPT_SNIPPETS,
  javascript: TYPESCRIPT_SNIPPETS,
  typescriptreact: TYPESCRIPT_SNIPPETS,
  javascriptreact: TYPESCRIPT_SNIPPETS,
  python: PYTHON_SNIPPETS,
  go: GO_SNIPPETS,
  rust: RUST_SNIPPETS,
}

let registered = false

const SNIPPETS_REGISTERED_KEY = '__TERALEXI_MONACO_SNIPPETS_REGISTERED__' as const

function registerSnippetsForLanguage(languageId: string, snippets: SnippetDef[]): void {
  monaco.languages.registerCompletionItemProvider(languageId, {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      return {
        suggestions: snippets.map((snippet) => ({
          label: snippet.prefix,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          insertText: snippet.body.join('\n'),
          documentation: snippet.description,
          detail: 'Snippet',
          range,
        })),
      }
    },
  })
}

export function registerBuiltInSnippets(): void {
  const g = globalThis as Record<string, unknown>
  if (registered || g[SNIPPETS_REGISTERED_KEY]) return
  registered = true
  g[SNIPPETS_REGISTERED_KEY] = true
  try {
    for (const [languageId, snippets] of Object.entries(SNIPPET_PACKS)) {
      registerSnippetsForLanguage(languageId, snippets)
    }
  } catch {
    registered = false
    delete g[SNIPPETS_REGISTERED_KEY]
  }
}
