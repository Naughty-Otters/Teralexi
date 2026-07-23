# Coding guide — file change UI

How teralexi shows **edits, writes, and patches** in the agent chat. Use this when extending file tools, HITL approval, or the diff renderer.

---

## Design principle

Use **one diff presentation layer**, not separate UIs per tool:

| Tool | Same UI? | Notes |
|------|----------|--------|
| `edit_file` | Yes | Search/replace input → dry-run preview |
| `write_file` | Yes | Full file body → diff vs existing (or empty) |
| `apply_patch` | Yes | Multi-file stack of cards |
| `delete_file` | Yes | Full-file deletion preview |
| `move_file` | Yes | Rename card (`moveFrom` → `path`) |
| `copy_file` | Yes | Create-at-destination preview |
| `shell` | Yes* | stdout/stderr primary; when the command mutates workspace files, incidental `files[]` diffs are also shown |
| `run_script` / `run_script_file` | Yes* | Same: terminal + incidental workspace `files[]` when scripts write outside the sandbox |
| `git_diff` | Same renderer | Read-only; no preview IPC |

\* Prefer `edit_files` for intentional source edits. Shell/script diffs are a safety net when the model mutates files via commands.

Chat shows **unified diff** (green/red lines). Side-by-side editors belong in the sandbox/report panel, not in the approval bubble.

---

## Data contract

Shared types live in `src/shared/file-change/types.ts`:

```ts
type FileChangePreview = {
  path: string          // sandbox-relative
  diff: string          // unified diff (jsdiff)
  additions: number
  deletions: number
  action?: 'create' | 'modify' | 'delete' | 'rename'
  moveFrom?: string     // rename source
}
```

Tool execute results and preview IPC both return:

```ts
{ ok: true, files: FileChangePreview[] }
// or legacy flat fields still supported:
{ diff, additions, deletions, path, sandboxRoot, files?: [...] }
```

**Parser:** `src/shared/file-change/parse-tool-file-changes.ts` — `parseToolFileChanges(output)` normalizes execute output for the renderer.

**Result type:** Every object-shaped tool execute result is stamped with `resultType` in the tool loop (`src/shared/tool-result/normalize-tool-result.ts` via `applyToolResultPresentation`). The renderer maps `file_change` → diff cards, `terminal` → terminal bubble, `todo` → checklist, `raw` / `error` → generic tool row. File-change tools also get a normalized `files[]` when only legacy `diff` fields are present.

**Agentic Run / step progress:** Tool outputs in the live stream and step digests use `formatToolResultForDisplay` (`src/shared/tool-result/format-tool-result-for-display.ts`) via `serializeForAgentCollect` — not raw JSON — so `shell` shows command output instead of metadata blobs.

**Builder:** `toolSet/file-system/file-io-utils.ts` — `buildFileChangePreview(sandboxRoot, absolutePath, old, new, extras?)` creates rows from content; used by tools and preview.

---

## Main process — dry-run preview

Approval runs **before** execute (AI SDK `needsApproval`). The diff in tool output only exists after approval, so the UI calls preview at HITL time.

| Piece | Path |
|-------|------|
| Preview logic | `toolSet/file-system/file-change-preview.ts` |
| IPC handler | `PreviewFileChange` in `src/main/services/ipc-main-handle.ts` |
| IPC type | `src/ipc/channel.ts` |

```ts
previewFileChange(toolName, input) → FileChangePreviewResult
```

Supported tools: `edit_file`, `write_file`, `apply_patch`, `delete_file`, `move_file`, `copy_file`. Preview reads the sandbox and applies the same in-memory transforms as execute — **no writes**.

**Workspace panel:** Click a path in `FileChangeCard` to open the workspace panel (Files tab) and highlight that row. Navigation state lives in `src/renderer/store/modules/workspace-navigation/`.

Requires an active conversation sandbox (`requireActiveSandbox()`).

---

## Renderer components

| Component | Role |
|-----------|------|
| `UnifiedDiffView.vue` | Colored unified diff lines |
| `FileChangeCard.vue` | One file: path, action badge, +/- counts, diff |
| `FileChangeStack.vue` | List of cards + loading/error empty states |
| `useFileChangePreview.ts` | Calls `PreviewFileChange` IPC when tool input changes |

Location: `src/renderer/views/agent-chat/components/file-change/`

### Where they appear

| Moment | Component | Data |
|--------|-----------|------|
| **Pending approval** | `ChatToolApprovalCard.vue` | IPC preview from tool **input** |
| **After approval** | `ChatToolInvocationRow.vue` | `parseToolFileChanges(tool output)` |

`ChatAssistantMessageParts.vue` renders:

- `ChatToolApprovalCard` when `state === 'approval-requested'`
- `ChatToolInvocationRow` when `shouldShowApprovedFileChangePart(part)` (HITL file tool with diff output)

Helpers: `src/renderer/views/agent-chat/components/chat/chatToolPartHelpers.ts`

---

## Tool output shape

When implementing or extending file tools, return:

```ts
return {
  sandboxRoot: sandbox.root,
  path: targetPath,           // optional absolute path (legacy)
  diff: fileChange.diff,      // joined diff for LLM / logs
  additions,
  deletions,
  files: [fileChange],         // preferred for UI
}
```

`apply_patch` returns `files[]` with one entry per hunk (add/update/delete/rename).

---

## Adding a new file-mutating tool

1. Use `buildFileChangePreview()` (or return `files[]`) from execute.
2. Add the tool name to `FILE_CHANGE_TOOL_NAMES` in `src/shared/file-change/types.ts`.
3. Implement a branch in `previewFileChange()` (dry-run only).
4. No new Vue components — `FileChangeStack` picks it up automatically.

---

## Tests

| Area | File |
|------|------|
| Output parsing | `src/shared/file-change/parse-tool-file-changes.test.ts` |
| Dry-run preview | `toolSet/file-system/file-change-preview.test.ts` |
| Tool integration | `toolSet/file-system.test.ts` |

Run:

```bash
npm test -- src/shared/file-change toolSet/file-system/file-change-preview
```

---

## Workspace vs sandbox

Path resolution is centralized in [`src/main/agent/sandbox/paths.ts`](src/main/agent/sandbox/paths.ts) (`resolvePathInContext`). Tool copy and skill instructions steer the model; behavior does not change per skill.

| Root | Typical paths | Skills |
|------|----------------|--------|
| **User workspace** | `src/foo.ts`, `.`, absolute under project root | Coding, Code review |
| **Agent sandbox** | `output/`, `scripts/`, `refs/`, `skills/` | Default, Documents |

| Tool family | Focus |
|-------------|--------|
| `read_file`, `edit_files`, `lsp` | User project |
| `shell` | User project commands (git/`rg`/tests); OS shell via `use_shell` |
| `run_script`, `run_script_file` | Sandbox scripts (`output/scripts/`, captures) |
| `web_search`, `web_scrape` | Research |
| `invoke_agents` | Sub-agents (`profile`: explore / bash / browser; command tool is `shell`) |

**Composer UX:** Coding and Code review agents require a selected workspace before send ([`src/shared/agent/workspace-required-skills.ts`](src/shared/agent/workspace-required-skills.ts)).

**Hints in toolSet:** [`WORKSPACE_PATH_HINT`](toolSet/file-system/constants.ts) on project I/O tools; shell in [`toolSet/file-system/run-workspace-command.ts`](toolSet/file-system/run-workspace-command.ts); sandbox scripts in [`toolSet/shell-command.ts`](toolSet/shell-command.ts).

---

## Skills

| Skill | Path | Use |
|-------|------|-----|
| Coding | `skills/coding/` | Edit → `shell` verify → `git_diff` |
| Default | `skills/default/` | Sandbox scripts; no repo edits unless workspace + user asks |
| Documents | `skills/documents/` | Deliverables under `output/results/` |

---

## Related docs

- File tools implementation: `skills/SKILL-DEVELOPMENT.md` (file-system section)
- Agent LLM / HITL pipeline: `src/main/agent/llm/README.md`
