# Sub-agent recipes (Cursor-style profiles)

Use `invoke_agents` with a `profile`. **Prefer Cursor built-ins first** when the
workload matches — isolate noisy work; parent only sees the brief.

One child = one-element `runs` array. Multiple = parallel. Always waits for results.

## Priority built-ins (use these first)

| Profile | Cursor analogue | Tools | When |
| --- | --- | --- | --- |
| `explore` | Explore | `read_file`, `lsp`, read-only shell | Find/where/how; map before edits |
| `bash` | Bash | **`shell`** (not a `bash`/`run_script` tool), `read_file` | Tests, builds, rg/find, git |
| `browser` | Browser | `web_search` / `web_scrape` + browser MCP | Pages, DOM, screenshots |

Omit `agentId` when using a profile — defaults to `skill:coding`.

**Important:** `bash` / `explore` / `browser` are **profiles** for `invoke_agents`. The command tool is always `shell`. Never call tools named `bash` or `run_script` — they do not exist.

## Orchestration profiles

| Profile | Role |
| --- | --- |
| `architect` / `plan` | Read-only implementation plan (+ todos) |
| `coder` | Implement via `edit_files`; may use a worktree; auto-merge |

## Examples

```text
invoke_agents({ runs: [{ profile: "explore", task: "Where is auth middleware?" }] })

invoke_agents({ runs: [
  { profile: "explore", task: "…" },
  { profile: "bash", task: "Run npm test and summarize" },
] })
```

## Parent rules

- Prefer built-in profiles **before** doing the same loop in the parent.
- Consume the **brief**; do not re-run after a successful brief.
- File changes from coder runs are **auto-merged**.
