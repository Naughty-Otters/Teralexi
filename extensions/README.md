# Teralexi Extensions — Author Guide

An **extension** is an installable package that contributes hooks, channels, LLM providers, and UI panels to the Teralexi agent runtime. Extensions ship as a directory with an `extension.json` manifest and optional hook/action files.

This guide covers structure, interfaces, runtime behavior, and a step-by-step walkthrough. For the full architecture RFC, see [`docs/EXTENSION-HOOKS-ARCHITECTURE.md`](../docs/EXTENSION-HOOKS-ARCHITECTURE.md).

---

## Quick start

Bundled samples under `extensions/`:

| Extension | Demonstrates |
|-----------|--------------|
| [`secret-guard/`](secret-guard/) | Command + function hooks (path blocking + audit log) |
| [`hook-judge/`](hook-judge/) | `function-ref` + `prompt` hook bindings |
| [`demo-channel/`](demo-channel/) | `channels` + `uiPanels` contributions |
| [`demo-llm/`](demo-llm/) | `llmProviders` contribution |

Start with **secret-guard** for hooks, then explore the others for contribution registries.

**To activate an extension in the app:**

1. Open **Settings → Extensions**
2. Select the extension
3. **Approve** any pending hook reviews (required before hooks run)
4. Ensure the extension toggle is **enabled**

---

## Where extensions live

Extensions are discovered from three layers. When the same `id` appears in multiple layers, **user wins over project, project wins over bundled**.

| Layer | Path | Use case |
|-------|------|----------|
| **Bundled** | `extensions/<id>/` (repo root, shipped with the app) | Built-in defaults |
| **Project** | `<workspace>/.teralexi/extensions/<id>/` | Team-shared, checked into git |
| **User** | `~/.teralexi/extensions/<id>/` | Personal installs |

A folder is loadable when it contains a valid `extension.json` (same “marker file” pattern as `skill.md` for skills).

---

## Directory structure

```
my-extension/
  extension.json          # Required — manifest (id, version, permissions, optional contributes)
  hooks/
    hooks.json            # Optional — command hooks (map or array format)
  actions/
    index.ts              # Optional — hooks, channels, llmProviders, uiPanels, tools
  actions/guard.ts        # Optional — module targets for function-ref hooks
  scripts/                # Optional — helper scripts referenced by command hooks
  ui/                     # Optional — Vue components referenced by uiPanels
  refs/  form/            # Optional — same conventions as skills
```

### Minimal extension (manifest only)

```
my-extension/
  extension.json
```

### Hooks-only extension

```
my-extension/
  extension.json
  hooks/hooks.json
  scripts/run-check.sh
```

### Extension with in-process function hooks

```
my-extension/
  extension.json
  actions/index.ts        # export const hooks = { ... }
```

You can combine all three hook sources in one extension: `contributes.hooks` in the manifest, `hooks/hooks.json`, and `export const hooks` in `actions/index.ts`.

---

## `extension.json` — manifest reference

Types are defined in [`skill-sdk/extension-types.ts`](../skill-sdk/extension-types.ts) and validated at load time by a Zod schema.

```jsonc
{
  "id": "my-extension",           // Required. Unique extension id (semver folder name often matches)
  "version": "1.0.0",             // Required. Semver string
  "permissions": {                // Optional. Shown in Settings → Extensions
    "network": false,
    "filesystem": "workspace",    // "none" | "workspace" | "full"
    "shell": false,
    "credentials": ["google-oauth"]
  },
  "activationEvents": [             // Optional. Documented for future use
    "onStartup"
  ],
  "contributes": {
    "hooks": {                      // Optional. Event-keyed hook bindings
      "beforeToolCall": [
        { "type": "command", "command": "${EXTENSION_ROOT}/scripts/check.sh" }
      ]
    }
  }
}
```

### `ExtensionManifest` interface

```ts
interface ExtensionManifest {
  id: string
  version: string
  permissions?: ExtensionPermissions
  activationEvents?: ActivationEvent[]
  contributes?: {
    hooks?: Partial<Record<HookEvent, HookBinding[]>>
  }
}
```

### `ExtensionPermissions`

| Field | Type | Meaning |
|-------|------|---------|
| `network` | `boolean` | Extension needs network access |
| `filesystem` | `'none' \| 'workspace' \| 'full'` | Filesystem access level |
| `shell` | `boolean` | Shell/subprocess access |
| `credentials` | `string[]` | Credential ids (e.g. `google-oauth`) |

Permissions are **declarative today** — they are displayed in Settings for user review. Enforcement is planned for a later phase.

### `ActivationEvent` (reserved)

`'onStartup' | 'onChatOpen' | 'onCommand' | 'onChannelMessage'`

Declared in the manifest for documentation and future lazy-loading. All enabled extensions are scanned at startup today.

---

## Hooks

Hooks let you observe or govern agent lifecycle events: before/after tool calls, conversation turns, MCP calls, and tool approval.

### Hook precedence

When an event fires, **all matching hooks run sequentially** in this order:

1. Extension hooks (bundled → project → user), enabled + trusted only
2. Project `hooks.json` — `<workspace>/.teralexi/hooks.json`
3. Global `hooks.json` — `~/.teralexi/hooks.json`
4. Per-conversation hooks (stored in SQLite)

### Events dispatched today

These events are actually fired by the runtime (`RUNTIME_HOOK_EVENTS`):

| Event | When it fires | Blocking by default? |
|-------|---------------|----------------------|
| `onSessionStart` | Conversation opens | No |
| `preHook` | Before a turn begins | **Yes** |
| `postHook` | After a turn ends | No |
| `beforeToolCall` | Before a skill/toolSet tool runs | **Yes** |
| `afterToolCall` | After a skill/toolSet tool completes | No |
| `onApprovalRequired` | Before tool approval UI | **Yes** |
| `PreMcpToolUse` | Before an MCP tool call | **Yes** |
| `PostMcpToolUse` | After an MCP tool call (including on error) | No |

### Event name aliases

Manifest and `hooks/hooks.json` may use Codex/Claude Code names; they are normalized at load time:

| Alias | Canonical name |
|-------|----------------|
| `PreToolUse` | `beforeToolCall` |
| `PostToolUse` | `afterToolCall` |
| `PermissionRequest` | `onApprovalRequired` |

Additional event names exist in the type union (`ChannelMessageReceived`, `MemoryWrite`, etc.) for future phases — they are **not dispatched yet**.

### Hook binding types

```ts
type HookBinding =
  | { type: 'command'; command: string; args?: string[]; timeout?: number }
  | { type: 'function'; module: string; export: string }   // resolved from extension dir
  | { type: 'prompt'; prompt: string; model?: string }     // LLM judge
  | { type: 'agent'; agentId: string }                   // one-shot sub-agent
```

**Supported today:**

- **`command`** — runs a subprocess via `execFile`. Best for shell scripts, polyglot tools, and quick local checks.
- **`function`** — in-process `HookHandler` from either:
  - `export const hooks` in `actions/index.ts`, or
  - `{ type: 'function', module, export }` in manifest / `hooks/hooks.json` (resolved relative to extension root)
- **`prompt`** — LLM-as-judge via `generateText`. Model is `provider:model` (e.g. `openai:gpt-4o-mini`) or falls back to the parent agent's provider/model. Requires configured credentials.
- **`agent`** — runs a catalog sub-agent with the hook context as its task; parses JSON from the child's summary. Requires an active parent agent run (tool loop / conversation).

---

## Declaring hooks

### Option A — `hooks/hooks.json` (recommended for command hooks)

Event-keyed map format (used by `secret-guard`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "${EXTENSION_ROOT}/scripts/block-secret-paths.sh"
      }
    ]
  }
}
```

Legacy array format (same as global `~/.teralexi/hooks.json`) is also supported:

```json
{
  "hooks": [
    { "event": "preHook", "command": "node", "args": ["my-hook.js"] }
  ]
}
```

Use `${EXTENSION_ROOT}` in command paths — it is replaced with the absolute path to the extension directory at runtime.

### Option B — `contributes.hooks` in `extension.json`

Same binding shape as above, nested under the manifest:

```json
{
  "id": "my-extension",
  "version": "1.0.0",
  "contributes": {
    "hooks": {
      "beforeToolCall": [
        { "type": "command", "command": "${EXTENSION_ROOT}/scripts/check.sh", "timeout": 10000 }
      ]
    }
  }
}
```

### Option C — `actions/index.ts` function hooks

For in-process TypeScript handlers (audit logs, input rewriting, fast checks):

```ts
import type { HookHandler } from '@teralexi/skill-sdk'

export const hooks: Partial<Record<string, HookHandler>> = {
  afterToolCall: async (ctx) => {
    // ctx.toolName, ctx.toolInput, ctx.toolResult, ctx.conversationId, ...
    return { continue: true }
  },

  beforeToolCall: async (ctx) => {
    // Block the call:
    // return { continue: false, stopReason: 'Not allowed' }

    // Or rewrite tool input:
    return {
      continue: true,
      hookSpecificOutput: {
        updatedInput: { path: '/safe/path' },
      },
    }
  },
}
```

The module is compiled and loaded through the same sandboxed `skill-module-loader` pipeline as skill `actions/index.ts`. Import `@teralexi/skill-sdk` for types; Node built-ins (`fs`, `path`, etc.) are available within the sandbox.

### Option D — `function-ref` in manifest or `hooks/hooks.json`

Point at a TypeScript module under the extension directory:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "function",
        "module": "actions/guard.ts",
        "export": "beforeToolCall"
      }
    ]
  }
}
```

```ts
// actions/guard.ts
import type { HookHandler } from '@teralexi/skill-sdk'

export const beforeToolCall: HookHandler = async (ctx) => {
  if (String(ctx.toolInput).includes('rm -rf')) {
    return { continue: false, stopReason: 'Destructive command blocked' }
  }
  return { continue: true }
}
```

See [`hook-judge/`](hook-judge/) for a full example.

### Option E — `prompt` and `agent` bindings

In `extension.json` or `hooks/hooks.json`:

```json
{
  "contributes": {
    "hooks": {
      "onApprovalRequired": [
        {
          "type": "prompt",
          "prompt": "Deny if the tool reads secrets. Reply with JSON only.",
          "model": "openai:gpt-4o-mini"
        }
      ],
      "beforeToolCall": [
        { "type": "agent", "agentId": "coding" }
      ]
    }
  }
}
```

**Prompt hooks** must return JSON on stdout (command) or as the model response:

```json
{ "continue": true, "hookSpecificOutput": { "permissionDecision": "allow" } }
```

**Agent hooks** require a parent run with sub-agent delegation enabled; the child agent should reply with the same JSON shape in its final message.

## Hook I/O contract

### Input — `HookInvocationContext`

Every hook receives a JSON payload with at least:

```ts
type HookInvocationContext = {
  event: HookEvent
  conversationId?: string
  agentId?: string
  assistantMessageId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown        // afterToolCall / PostMcpToolUse
  workspacePath?: string | null
  userMessage?: string        // preHook / postHook
  hasError?: boolean          // postHook / PostMcpToolUse on failure
  errorMessage?: string
  finalContent?: string
}
```

**Command hooks** receive this as:
- The **last argv element** (legacy contract)
- **stdin** (new — same JSON string)

**Function hooks** receive the parsed object directly.

### Output — blocking (command hooks)

For blocking events (`beforeToolCall`, `preHook`, `PreMcpToolUse`, `onApprovalRequired`):

- **Non-zero exit code** or **non-empty stderr** → blocks the action; stderr text is shown to the user.
- Exit code 0 with empty stderr → pass.

### Output — `hookSpecificOutput` (command and function hooks)

Write JSON to **stdout** (command hooks) or return from the handler (function hooks):

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Extra instructions injected into the agent prompt or tool result.",
    "updatedInput": { "path": "/rewritten/path" },
    "permissionDecision": "allow"
  }
}
```

| Field | Effect at call site |
|-------|---------------------|
| `updatedInput` | Shallow-merged into tool/MCP input before execution (`beforeToolCall`, `PreMcpToolUse`); can rewrite `userMessage` on `preHook` |
| `additionalContext` | Appended to system prompt (`preHook`, `onSessionStart`) or attached to tool result (`afterToolCall`, `PostMcpToolUse`) |
| `permissionDecision` | `'allow'` → auto-approve tool; `'deny'` → block; `'ask'` → show approval UI (`onApprovalRequired`) |

Function hooks return:

```ts
type HookResult = {
  continue: boolean
  stopReason?: string
  hookSpecificOutput?: { ... }
}
```

`continue: false` on a blocking event blocks the action (same as stderr for command hooks).

---

## Trust review

Extension hooks are **not executed until trusted**. On first discovery (or when hook content changes), each hook source is marked `pending`:

| Source | Trust key includes |
|--------|-------------------|
| `extension.json#contributes.hooks` | Manifest hooks JSON |
| `hooks/hooks.json` | File content hash |
| `actions/index.ts` | Exported hooks + contributions (channels, llmProviders, uiPanels) |

**Users approve or reject hooks in Settings → Extensions.** Until approved:

- Pending hooks do not run
- The extension shows a “Review required” badge

Disabling an extension in Settings immediately removes its hooks from the runtime (host cache is invalidated).

---

## Step-by-step: build your first extension

### 1. Create the directory

```bash
mkdir -p ~/.teralexi/extensions/my-guard/hooks
# Or for team sharing:
mkdir -p .teralexi/extensions/my-guard/hooks
# Or for bundled (repo):
mkdir -p extensions/my-guard/hooks
```

### 2. Write `extension.json`

```json
{
  "id": "my-guard",
  "version": "0.1.0",
  "permissions": {
    "filesystem": "workspace",
    "shell": true,
    "network": false
  }
}
```

### 3. Add a command hook

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "preHook": [
      {
        "type": "command",
        "command": "${EXTENSION_ROOT}/scripts/log-turn.sh"
      }
    ]
  }
}
```

Create `scripts/log-turn.sh`:

```bash
#!/bin/bash
# Observational — preHook blocks only on stderr/exit != 0
payload="${@: -1}"
echo "[my-guard] turn: $(echo "$payload" | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(c.userMessage||'')")" >> /tmp/my-guard.log
exit 0
```

```bash
chmod +x scripts/log-turn.sh
```

### 4. (Optional) Add a function hook

Create `actions/index.ts`:

```ts
import type { HookHandler } from '@teralexi/skill-sdk'

export const hooks: Record<string, HookHandler> = {
  afterToolCall: async (ctx) => ({
    continue: true,
    hookSpecificOutput: {
      additionalContext: `Tool ${ctx.toolName} completed.`,
    },
  }),
}
```

### 5. Install and activate

- **User layer:** copy the folder to `~/.teralexi/extensions/my-guard/`
- **Project layer:** commit to `<repo>/.teralexi/extensions/my-guard/`
- **Bundled:** place under `extensions/my-guard/` in the repo and rebuild (see [Bundled extensions](#bundled-extensions))

Restart the app (or toggle the extension in Settings), then:

1. Settings → Extensions → **my-guard**
2. Approve pending hook reviews
3. Enable the extension

### 6. Test

- Trigger a conversation turn → `preHook` command should run
- Run a tool → `afterToolCall` function hook should add context to the result
- For blocking hooks, verify stderr/exit blocks the action

---

## Worked examples

### `secret-guard` — command + function hooks

```
secret-guard/
  extension.json
  hooks/hooks.json              # PreToolUse → blocks credential paths (command)
  scripts/block-secret-paths.sh
  actions/index.ts              # afterToolCall → audit log (function)
```

**Command hook** (`hooks/hooks.json`): runs before every tool call. If `toolInput` contains a path with `.env` or `credentials`, the script writes to stderr and exits 1 → tool call is blocked.

**Function hook** (`actions/index.ts`): runs after every tool call. Appends a JSON line to `~/.teralexi/audit.log`.

### `hook-judge` — function-ref + prompt hooks

```
hook-judge/
  extension.json                # onApprovalRequired → prompt binding
  hooks/hooks.json              # PreToolUse → function-ref → actions/guard.ts
  actions/guard.ts
```

- **function-ref**: fast regex guard on tool input (no subprocess, no LLM cost)
- **prompt**: LLM review on `onApprovalRequired` (requires OpenAI credentials if using `openai:gpt-4o-mini`)

### `demo-channel` — channels + uiPanels

```
demo-channel/
  extension.json
  actions/index.ts              # export const channels, export const uiPanels
  ui/DemoChannelPanel.vue       # component path referenced by uiPanels
```

Registers channel id `demo-channel:log` in `ChannelRegistry`. Outbound messages append to `~/.teralexi/demo-channel.log`. Settings → Extensions shows the contributed UI panel metadata.

### `demo-llm` — llmProviders

```
demo-llm/
  extension.json
  actions/index.ts              # export const llmProviders
```

Registers provider id `demo-llm:local`. The bundled adapter is a stub for registry wiring; production extensions should return a real AI SDK `LanguageModel` from `adapter.createModel()`.

See source files in each directory for full implementations.

---

## `actions/index.ts` — full module interface

Extensions reuse the skill actions module loader. Exports from `actions/index.ts`:

```ts
interface ExtensionActionsModule extends SkillToolModule {
  tools?: SkillTool[]
  composerToolbarPlugins?: ...
  channels?: Record<string, ExtensionChannelSender>   // ChannelRegistry
  llmProviders?: Record<string, LlmProviderContribution>
  uiPanels?: Record<string, UiPanelContribution>    // Settings metadata (IPC)
  hooks?: Partial<Record<HookEvent, HookHandler>>
}
```

Registry ids are always `extensionId:localId` (e.g. `demo-channel:log`, `demo-llm:local`).

Import types from `@teralexi/skill-sdk`:

```ts
import type {
  HookHandler,
  HookEvent,
  HookResult,
  HookInvocationContext,
  ExtensionManifest,
  ExtensionActionsModule,
  ExtensionChannelSender,
  LlmProviderContribution,
  UiPanelContribution,
  ExtensionProviderAdapter,
} from '@teralexi/skill-sdk'
```

### `channels` example

```ts
import type { ExtensionChannelSender } from '@teralexi/skill-sdk'

export const channels: Record<string, ExtensionChannelSender> = {
  log: {
    async sendToTarget(target, text) {
      // deliver message — scheduler uses registry id demo-channel:log
    },
  },
}
```

### `llmProviders` example

```ts
import type { ExtensionProviderAdapter, LlmProviderContribution } from '@teralexi/skill-sdk'

class MyAdapter implements ExtensionProviderAdapter {
  createModel(modelId: string, creds: unknown) {
    // return AI SDK LanguageModel
    return { modelId, creds }
  }
}

export const llmProviders: Record<string, LlmProviderContribution> = {
  local: {
    label: 'My Provider',
    adapter: new MyAdapter(),
    credentialFields: ['apiKey', 'baseURL'],
  },
}
```

### `uiPanels` example

```ts
import type { UiPanelContribution } from '@teralexi/skill-sdk'

export const uiPanels: Record<string, UiPanelContribution> = {
  settings: {
    label: 'My Extension',
    component: 'ui/SettingsPanel.vue',  // relative to extension dir
  },
}
```

Panels appear under **Settings → Extensions** when the extension is enabled and its `actions/index.ts` is trusted. **Settings → LLM** and **Settings → Channels** also list trusted `llmProviders` and `channels` exports under an **Extensions** sidebar group.

> **Trust required:** `channels`, `llmProviders`, and `uiPanels` only register after you approve the extension's `actions/index.ts` trust review in **Settings → Extensions**. Toggle the extension on, approve pending reviews, then open the LLM or Channels tab (or switch away and back).

---

## Bundled extensions

Ship an extension with the app by placing it under `extensions/<id>/` at the repo root.

Build pipeline:

1. `.electron-vite/generate-bundled-extensions.ts` walks `extensions/` and emits `src/main/skills/bundled-extensions.generated.ts`
2. Run automatically during `npm run build` (main process build step)
3. At runtime, `resolveBundledExtensionsDirectory()` points to `<app>/extensions/` (packaged) or `<repo>/extensions/` (dev)

To regenerate manifests manually:

```bash
npx tsx .electron-vite/generate-bundled-extensions.ts
```

---

## Settings UI

**Settings → Extensions** shows:

- Extension id, version, source (bundled / project / installed)
- Declared permissions and hook event names
- Enable/disable toggle (persisted per user in SQLite)
- Pending hook review cards with Approve / Reject
- Contributed UI panels (metadata + host shell) when `uiPanels` is exported

IPC channels (for reference):

| Channel | Purpose |
|---------|---------|
| `ListExtensions` | List discovered extensions + enabled state |
| `SetExtensionEnabled` | Toggle extension on/off |
| `ListPendingHookReviews` | List hook sources awaiting trust |
| `SetHookTrustStatus` | Approve or reject a hook source |
| `ListExtensionChannels` | Trusted extension channels |
| `ListExtensionUiPanels` | Trusted extension settings panels |
| `ListExtensionLlmProviders` | Extension LLM provider metadata |

---

## Design guidelines

1. **Keep hooks fast.** Command hooks spawn a subprocess (30s default timeout). Prefer function hooks for hot paths like `afterToolCall` auditing.
2. **Use blocking events sparingly.** Only `beforeToolCall`, `preHook`, `PreMcpToolUse`, and `onApprovalRequired` can block. Everything else is observational.
3. **Declare permissions honestly.** Even though enforcement is not fully wired, users see permissions before approving hooks.
4. **One concern per extension.** Split audit logging from path blocking into separate extensions if they evolve independently.
5. **Version your manifest.** Bump `version` when hook behavior changes — users will see a new trust review for changed hook content.
6. **Prefer `${EXTENSION_ROOT}`** over hardcoded paths so the same extension works in bundled, project, and user locations.
7. **Test both hook formats** if you ship `hooks/hooks.json` — map format for manifest-style events, array format if you want parity with global `hooks.json`.
8. **Namespace contributions** — registry ids are `extensionId:localId`; use short local ids (`log`, `local`) since the extension id is prefixed automatically.

---

## Contribution registries

Trusted `actions/index.ts` modules can export runtime contributions in addition to hooks:

| Export | Registry | Registry id |
|--------|----------|---------------|
| `channels` | `ChannelRegistry` | `extensionId:channelId` |
| `llmProviders` | `extension-llm-provider-registry` | `extensionId:providerId` |
| `uiPanels` | extension UI panel list (IPC) | `extensionId:panelId` |

Hook bindings in `extension.json`, `hooks/hooks.json`, or flat `hooks.json` support all four binding types:

| Type | Shape | Runtime |
|------|-------|---------|
| `command` | `{ type: 'command', command, args? }` | subprocess |
| `function` | `{ type: 'function', module, export }` | resolved from extension dir |
| `prompt` | `{ type: 'prompt', prompt, model? }` | LLM judge (`provider:model` or default from parent run) |
| `agent` | `{ type: 'agent', agentId }` | one-shot sub-agent (requires active parent run) |

IPC:

| Channel | Purpose |
|---------|---------|
| `ListExtensionChannels` | Trusted extension channels |
| `ListExtensionUiPanels` | Trusted extension settings panels |
| `ListExtensionLlmProviders` | Extension LLM provider metadata |

---

## Not yet implemented

The following are defined in types or the architecture RFC but **not wired in the current runtime**:

- ClawHub extension install/update
- Dynamic renderer import of extension `uiPanels` Vue components (metadata + host shell only today)
- Persisting extension-scoped LLM providers in `agent_configurations` (runtime registry only; built-in `ProviderType` CHECK unchanged)
- OpenFDE-specific events (`ChannelMessage*`, `Memory*`, `Workflow*`, `SkillInstall*`)
- Managed policy file (`~/.teralexi/policy.toml`)
- Strict permission enforcement
- `activationEvents` lazy loading

---

## Related docs

- [`docs/EXTENSION-HOOKS-ARCHITECTURE.md`](../docs/EXTENSION-HOOKS-ARCHITECTURE.md) — full RFC and phased rollout
- [`skill-sdk/extension-types.ts`](../skill-sdk/extension-types.ts) — author-facing TypeScript types
- [`src/shared/agent/hooks.ts`](../src/shared/agent/hooks.ts) — runtime hook types and blocking event set
