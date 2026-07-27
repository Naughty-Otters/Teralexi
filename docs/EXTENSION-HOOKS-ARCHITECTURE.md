# Extensions, Plugins & Hooks — Unified Architecture Design

Status: **Proposal / RFC**
Scope: `src/main/skills/`, `src/main/agent/hooks/`, `src/shared/agent/`, `src/main/channels/`, `src/main/engine/`, ClawHub client

## 0. Why one design, not three

"Extension", "plugin", and "hook" are not three subsystems — they are three views of the same thing:

- An **Extension** is the installable *package* (manifest + files on disk, distributed via ClawHub).
- A **contribution point** is *what* an extension can add (a skill, a tool, an LLM provider, a channel, a UI panel, or a hook).
- A **hook** is *one specific* contribution point — a function that observes/governs a lifecycle event.

Designing hooks in isolation from extensions would produce a second, incompatible packaging/trust/config story next to the one skills already have. This document treats **Skill as the contribution kind that already exists**, and generalizes the same manifest, loader, trust, and marketplace machinery to cover the new kinds — including hooks.

**Terminology note**: other tools call the installable package a "plugin" (Claude Code, VS Code). This doc calls it an **Extension** instead, deliberately, because OpenFDE's codebase already uses the word "plugin" for something narrower and pre-existing: `SkillComposerToolbarPlugin` ([composer-toolbar-plugin.ts](../src/main/skills/composer-toolbar-plugin.ts)) is one specific UI contribution a skill can make today (a composer toolbar button), not a package format. Reusing "plugin" for the new installable-package concept would collide with that existing type name. So: **Extension = the installable unit** (what Claude Code calls a plugin); **`SkillComposerToolbarPlugin` = one pre-existing contribution kind**, folded into the Extension manifest below (§3) as `contributes.composerToolbarPlugins`, unchanged.

## 1. Current state (verified in code, not assumed)

OpenFDE (product name **Teralexi**) already has two independent, unconnected extensibility stories:

### 1.1 Skills — the mature one
- Types: [src/main/skills/types.ts](../src/main/skills/types.ts) — `SkillTool` (L172-191), `SkillProperties` frontmatter (L37-91), `ExecutionSteps` (L201-232).
- Loader/registry: [skills-directory-loader.ts](../src/main/skills/skills-directory-loader.ts), [skill-module-loader.ts](../src/main/skills/skill-module-loader.ts) (esbuild-compiles `actions/*.ts` to CJS in a sandboxed `require`), [executable-tool-registry.ts](../src/main/skills/executable-tool-registry.ts) (cache by `skill:<id>:<tool>` / `toolSet:<tool>` key, L13-58).
- Marketplace: [clawhub/clawhub-skill-lifecycle.ts](../src/main/skills/clawhub/clawhub-skill-lifecycle.ts) — install/update/uninstall from `https://clawhub.ai`, semver checks, moderation.
- Public SDK: `skill-sdk/` aliased as `@teralexi/skill-sdk`.
- UI contribution: `SkillComposerToolbarPlugin` ([composer-toolbar-plugin.ts](../src/main/skills/composer-toolbar-plugin.ts)) — the *only* existing UI-contribution point today, and it's skill-only.

### 1.2 Hooks — already exist, but minimal
This is the part most relevant to this RFC, and it's **not a green field**:

| Piece | File | What it does today |
|---|---|---|
| Event union | [user-hooks.ts:13-18](../src/main/agent/hooks/user-hooks.ts#L13) | `'beforeToolCall' \| 'afterToolCall' \| 'onSessionStart' \| 'onApprovalRequired' \| ConversationHookEvent` |
| Conversation events | [conversation-hooks.ts:10](../src/shared/agent/conversation-hooks.ts#L10) | `CONVERSATION_HOOK_EVENTS = ['preHook', 'postHook']` |
| Config file | [user-hooks.ts:49-52](../src/main/agent/hooks/user-hooks.ts#L49) | `~/.teralexi/hooks.json`, then `<cwd>/.teralexi/hooks.json` — first one found wins, **not merged** |
| Dispatcher | `runUserHooks()` [user-hooks.ts:109-141](../src/main/agent/hooks/user-hooks.ts#L109) | `execFile(command, [...args, JSON.stringify(ctx)])`, 30s timeout, blocks only if `blocking` event AND (non-empty stderr OR throw) |
| Call sites | [conversation.ts:374](../src/main/engine/conversation.ts#L374) (`onSessionStart`), [:389](../src/main/engine/conversation.ts#L389) (`preHook`, can block the turn), [:548,:673](../src/main/engine/conversation.ts#L548) (`postHook`), [step-helpers.ts:310](../src/main/agent/steps/step-helpers.ts#L310) (`beforeToolCall`, can block), [:355](../src/main/agent/steps/step-helpers.ts#L355) (`afterToolCall`) | |
| Per-conversation hooks | [conversation-settings-repository.ts](../src/main/services/conversation-store/conversation-settings-repository.ts), IPC `GetConversationHooks`/`SetConversationHooks` ([ipc-main-handle.ts:2872-2898](../src/main/services/ipc-main-handle.ts#L2872)) | Persisted per-conversation in SQLite, merged with global config at invocation time |

**Confirmed gaps by direct inspection** (not guesses):
1. `onApprovalRequired` is declared in the type union but **never dispatched anywhere** — dead code / stub for a feature that was never wired up.
2. No renderer UI consumes `GetConversationHooks`/`SetConversationHooks` (searched `src/renderer` — zero references) — the IPC exists, the settings screen doesn't.
3. Only handler type is `command` (subprocess exec). No `http`, `prompt`, or `agent` (LLM-as-judge) handler types.
4. No `additionalContext` / structured JSON output — a hook can only block (via stderr) or pass. It cannot inject context back into the model, rewrite tool input, or annotate a permission decision. Confirmed by searching the whole `src/` tree for `additionalContext`/`hookSpecificOutput` — zero hits.
5. Two hook config files at fixed paths, **not merged**, first-found-wins — no project + user + managed-policy layering.
6. No trust/review model — any `hooks.json` at those two paths runs immediately, unreviewed. This is Cursor's weakest characteristic (see companion research below); OpenFDE currently matches it, not Codex/Claude Code.
7. Hooks are **not packageable** — a skill or extension cannot ship a `hooks.json` the way Claude Code plugins bundle `hooks/hooks.json`. Hooks only come from the two fixed global paths or per-conversation DB rows.
8. No hook coverage of OpenFDE-only subsystems: channels ([channel-registry.ts](../src/main/channels/framework/channel-registry.ts)), MCP tool calls, skill install/update (ClawHub), workflows.

### 1.3 Everything else (from the prior proposal, unchanged)
- MCP client: [src/shared/mcp/](../src/shared/mcp/) — `McpRegistryServerDraft`, `resolveMcpServersForAgent`.
- Channels: one `manager.ts` per platform, all registering into `ChannelRegistry` ([channel-registry.ts:9-28](../src/main/channels/framework/channel-registry.ts#L9)) via `ChannelMessageSender.sendToTarget(target, text)`.
- LLM providers: closed union `LLM_PROVIDER_IDS` in [llm-provider-registry.ts:3](../src/shared/agent/llm-provider-registry.ts#L3), not dynamically extensible.

## 2. Design goals

1. **Evolve, don't replace** — every existing `hooks.json`, every `preHook`/`postHook`/`beforeToolCall`/`afterToolCall`/`onSessionStart` entry, and the `GetConversationHooks`/`SetConversationHooks` IPC contract must keep working unmodified after this ships.
2. **One packaging story** — an installable unit (an "Extension") can declare any mix of skills, tools, providers, channels, UI panels, and hooks in one manifest, distributed through the ClawHub pipeline that already exists for skills.
3. **Converge with the ecosystem where it's free** — adopt the event names, JSON I/O shape, and trust model that Codex CLI and Claude Code have already converged on (see §7), rather than inventing new vocabulary, so that skill/extension authors who know either tool feel at home.
4. **Differentiate where OpenFDE actually has more surface area** — channels, cross-session memory, and workflows have no equivalent in Codex/Cursor/Claude Code; hooks should cover them because nothing else does.
5. **No hidden privilege escalation** — a hook or extension's declared capabilities are visible before install/enable, consistent with the existing ClawHub moderation step.

## 3. The Extension manifest

An **Extension** is a directory with the same shape a skill has today (`skill.md`/`properties.md` + optional `actions/`), plus a new optional `extension.json` for non-skill contributions. A pure skill with no `extension.json` is a valid, minimal Extension — **zero migration needed for the 8 bundled skills**.

```ts
// skill-sdk/extension-types.ts (new — superset of skill-sdk/types.ts)
export interface ExtensionManifest {
  id: string
  version: string          // semver, reuses ClawHub's existing update-check logic
  permissions?: ExtensionPermissions
  activationEvents?: ActivationEvent[]   // default: 'onStartup'
  contributes?: {
    skills?: string[]        // relative paths to skill.md dirs (usually just '.')
    tools?: string[]          // toolSet-style modules, unchanged format
    llmProviders?: LlmProviderContribution[]
    channels?: ChannelContribution[]
    uiPanels?: UiPanelContribution[]          // NEW — sidebar/settings pages, no existing analog
    composerToolbarPlugins?: SkillComposerToolbarPlugin[]   // EXISTING mechanism, just
        // relocated into the manifest — same type as composer-toolbar-plugin.ts exports
        // today via a skill's actions/index.ts; unchanged behavior, unchanged registry
        // (composer-toolbar-registry.ts), just now also declarable by a non-skill Extension
    mcpServers?: McpRegistryServerDraft[]   // reuses existing type, L27 registry-types.ts
    hooks?: Partial<Record<HookEvent, HookBinding[]>>
  }
}

export type ActivationEvent = 'onStartup' | 'onChatOpen' | 'onCommand' | 'onChannelMessage'

export interface ExtensionPermissions {
  network?: boolean
  filesystem?: 'none' | 'workspace' | 'full'
  shell?: boolean
  credentials?: string[]     // e.g. ['google-oauth'], surfaced at install like ClawHub already does for skills
}
```

**Registries** — implemented (Phase 4 partial):

- `extension-contributions-registry.ts` registers `channels` → `ChannelRegistry`, `llmProviders` → `extension-llm-provider-registry`, `uiPanels` → IPC metadata list.
- Registry ids use `extensionId:localId` (see [`extension-contributions.ts`](../src/shared/agent/extension-contributions.ts)).
- Renderer dynamic import of `uiPanels` Vue components is still deferred; Settings shows metadata via `ExtensionUiPanelHost.vue`.

Channels already use exactly this pattern (`ChannelRegistry`, [channel-registry.ts:9-28](../src/main/channels/framework/channel-registry.ts#L9)) — extension channels register alongside built-in managers.

### 3.1 On-disk layout & discovery

Same bundled/user/project triad skills already use, plural directory name to match existing convention (`skills/`, `toolSet/`, not singular):

| Layer | Path | Precedence |
|---|---|---|
| Bundled (ships with the app) | `extensions/<id>/` at repo root | lowest |
| Project (repo-local, shared via git) | `<workspace>/.teralexi/extensions/<id>/` | middle — mirrors the existing `<workspace>/.teralexi/rules/*.md` project-scoped pattern |
| User-installed (via ClawHub or manual copy) | `~/.teralexi/extensions/<id>/` | highest — same id wins, exactly like skills today |

Build-time bundling mirrors [.electron-vite/generate-bundled-skills.ts](../.electron-vite/generate-bundled-skills.ts): a new `generate-bundled-extensions.ts` walks `extensions/` and emits `src/main/skills/bundled-extensions.generated.ts`, verified by a `verify-bundled-extensions.ts` script analogous to the existing `verify-bundled-toolset.ts`.

Inside one extension directory — every subpath is **auto-discovered by convention**, matching how `skill-module-loader.ts` already auto-discovers `actions/*.ts` and `toolSet/*.ts` without anything declaring them in a manifest:

```
extensions/my-extension/
  extension.json          # manifest — id, version, permissions, activationEvents (contributes.* is
                          # OPTIONAL to declare explicitly; anything auto-discovered below is picked
                          # up even if extension.json omits it, same as skill.md/properties.md today)
  skill.md                # optional — present only if this extension also contributes a skill
  properties.md           # optional — same
  actions/index.ts        # tools, llmProviders, channels, composerToolbarPlugins, and `function`-type
                          # hook handlers — loaded through the SAME sandboxed esbuild+CJS require
                          # skill-module-loader.ts already uses, no new sandbox needed
  hooks/hooks.json        # command-type hooks — IDENTICAL {"hooks":[{event,command,args?}]} shape as
                          # today's ~/.teralexi/hooks.json, just scoped to "only active while this
                          # extension is enabled" instead of global
  refs/  scripts/  form/  # reused unchanged from the skill convention
  ui/                     # new — Vue components for uiPanels contributions
```

**Where hooks actually live — direct answer to "hooks/<name>"**: there is no top-level `~/.teralexi/hooks/<name>/` directory of standalone hook packages. Two places only:
1. **Quick/local, not shareable**: a single flat file, `~/.teralexi/hooks.json` (today's mechanism, unchanged) or `<workspace>/.teralexi/hooks.json`.
2. **Packaged/shareable, installable via ClawHub**: `extensions/<id>/hooks/hooks.json` — a hooks-only extension is just an `extensions/<id>/` directory containing *nothing but* a `hooks/hooks.json` (see §11.1 below for a full worked example). The `hooks/` folder name is fixed by convention *inside* an extension directory, not a top-level location of its own.

## 4. Hook subsystem — detailed design

### 4.1 Event catalog

Columns marked **existing** map directly onto the current `UserHookEvent`/`ConversationHookEvent` union — same string, same call site, upgraded payload/return contract (backward compatible, see §4.4).

| Event | Status | Fires at | Call site to update |
|---|---|---|---|
| `onSessionStart` | existing | Conversation opens | [conversation.ts:374](../src/main/engine/conversation.ts#L374) |
| `preHook` | existing | Before a turn begins | [conversation.ts:389](../src/main/engine/conversation.ts#L389) |
| `postHook` | existing | After a turn ends | [conversation.ts:548,673](../src/main/engine/conversation.ts#L548) |
| `beforeToolCall` → alias `PreToolUse` | existing, renamed for parity | Before any skill/toolSet tool executes | [step-helpers.ts:310](../src/main/agent/steps/step-helpers.ts#L310) |
| `afterToolCall` → alias `PostToolUse` | existing, renamed for parity | After a tool call resolves | [step-helpers.ts:355](../src/main/agent/steps/step-helpers.ts#L355) |
| `onApprovalRequired` → `PermissionRequest` | **dead code today — this RFC is what wires it up** | Around a `SkillGuardRail`/HITL `form/` approval | new call site in the approval path (skill guardrail evaluation) |
| `SessionEnd` | new | Conversation closes | new call site, symmetric with `onSessionStart` |
| `PreCompact` / `PostCompact` | new | Around `maybeAutoCompactConversationHistory` | [conversation.ts:431](../src/main/engine/conversation.ts#L431) |
| `SubagentStart` / `SubagentStop` | new | Around `invoke_agents` delegation | `bindSubAgentDelegation`/`clearSubAgentDelegation` call sites, [step-helpers.ts:347-351](../src/main/agent/steps/step-helpers.ts#L347) |
| `PreMcpToolUse` / `PostMcpToolUse` | new | Around `callMcpToolDirect` | [step-helpers.ts:367](../src/main/agent/steps/step-helpers.ts#L367) — currently has **no** hook dispatch at all, unlike the skill-tool path |

**OpenFDE-specific events** (no Codex/Cursor/Claude Code equivalent — this is the differentiation):

| Event | Fires at | Call site | Why it matters here |
|---|---|---|---|
| `ChannelMessageReceived` | Inbound message from Slack/Discord/Telegram/WeChat/WhatsApp, before it reaches the agent engine | each channel's `manager.ts`, before invoking the engine | redact/rate-limit inbound content from an external, untrusted surface |
| `ChannelMessageSend` | Before `ChannelMessageSender.sendToTarget()` runs | [channel-registry.ts:12-14](../src/main/channels/framework/channel-registry.ts#L12) — wrap `sender.sendToTarget` | block/redact outbound content before it leaves the machine — no competitor has this because none has multi-channel bots |
| `SkillInstall` / `SkillUpdate` | Around ClawHub install/update | [clawhub-skill-lifecycle.ts](../src/main/skills/clawhub/clawhub-skill-lifecycle.ts) | org policy: block unsigned/unapproved skill installs — extends the *existing* moderation step from informational to enforceable |
| `WorkflowDeploy` / `WorkflowRun` | Around workflow deploy/execute | `workflow-executor.ts`, `workflow-compiler.ts` | workflows run unattended/scheduled — the one place a human isn't approving each turn, so governance matters most here |
| `MemoryWrite` / `MemoryRecall` | Around `@ai-sdk-tools/memory` persistence/read | memory integration point (main process) | filter what a long-lived local agent commits to durable memory, or what gets recalled into a prompt |

### 4.2 Handler types

Today: `command` only, args = `[...configuredArgs, JSON.stringify(ctx)]` on argv, blocking = non-empty stderr or throw. Keep this working unchanged as the default/legacy shape. Add:

```ts
type HookBinding =
  | { type: 'command'; command: string; args?: string[]; timeout?: number }       // existing shape, extended with timeout
  | { type: 'function'; module: string; export: string }   // NEW — runs in the same
        // sandboxed esbuild+CJS `require` skill-module-loader.ts already uses for
        // actions/*.ts, so no new process-spawn cost and no new sandbox to build
  | { type: 'prompt'; prompt: string; model?: string }      // NEW — LLM-as-judge,
        // reuses the existing multi-provider `llm-provider-registry.ts` — cheaper
        // to add here than it was upstream, since the provider abstraction exists
  | { type: 'agent'; agentId: string }                       // NEW — reuses the
        // existing `invoke_agents` sub-agent delegation (`toolSet/sub-agents/`)
        // instead of building a bespoke "verifier subagent" concept from scratch
```

`function` and `agent` handlers are the concrete OpenFDE advantage over Codex/Claude Code: both of those had to build subprocess or HTTP dispatch for every handler type because they had no existing in-process sandboxed module loader or sub-agent system to reuse. OpenFDE does.

### 4.3 Config resolution & precedence

Replace the current "first path found wins" ([user-hooks.ts:49-52](../src/main/agent/hooks/user-hooks.ts#L49)) with layered merge, highest-precedence last (same order pattern already used for skills: bundled → user, [skills-directory-loader.ts](../src/main/skills/skills-directory-loader.ts)):

1. Extension-bundled `hooks.json` (from `contributes.hooks` in an installed extension's manifest) — only active while the extension is enabled.
2. Project `<workspace>/.teralexi/hooks.json` (today this is `<cwd>/.teralexi/hooks.json` — keep the same file, just stop treating it as mutually exclusive with the user one).
3. User `~/.teralexi/hooks.json` (existing file, existing format — **unchanged**).
4. Conversation-level hooks from SQLite (existing `ConversationHooksConfig`, **unchanged** — still only `preHook`/`postHook`, still merged in at invocation time exactly as today).
5. Managed policy (`~/.teralexi/policy.toml`, new) — force-enabled, cannot be disabled by user/project/extension hooks; adds `allowManagedHooksOnly` to lock down 1-4.

All five layers run for a matching event (matches Cursor's "all matching hooks execute" model, not Claude Code's short-circuit-on-deny — appropriate here since blocking is already opt-in per event via `BLOCKING_HOOK_EVENTS`).

### 4.4 Backward-compatible payload/return upgrade

Current `HookInvocationContext` ([user-hooks.ts:33-47](../src/main/agent/hooks/user-hooks.ts#L33)) is passed as the last argv element (`JSON.stringify(ctx)`) and the *only* signal back is stderr content. Upgrade path that breaks nothing:

- Keep passing the JSON payload as the last argv arg (existing scripts parse `process.argv` today — removing this breaks them).
- **Additionally** write the same payload to the child's stdin, and **additionally** parse stdout as JSON if present (mirrors Codex/Claude Code's stdin/stdout contract). A hook script that ignores stdin/stdout keeps working exactly as before (stderr-blocking behavior unchanged); a hook script that wants the new capabilities (`additionalContext`, `permissionDecision`, `updatedInput`) opts in by writing JSON to stdout.
- Exit-code semantics stay as-is (throw-or-nonempty-stderr = block for blocking events) — do not adopt Claude Code's exit-code-2-means-block convention, since it would silently change behavior for every hook script already in the wild that exits non-zero for unrelated reasons.

### 4.5 Trust model (new)

Adopt Codex's hash-based review, adapted to Electron's existing settings surface rather than a CLI `/hooks` command:
- On first load of any `hooks.json` (global, project, or extension-bundled) and on every content change, mark it `pending-review`.
- Pending hooks do not run; a badge/notification in Settings → Hooks lists them for one-click trust/reject (same UX pattern as the ClawHub skill-permission consent screen that already exists for skill installs — reuse that component, don't build a second one).
- `allowManagedHooksOnly` (policy file) skips review for admin-pushed hooks and blocks everything else — this is the one new piece of enterprise-facing config; everything else in this RFC is single-user.

## 5. Backward compatibility checklist

- [ ] `~/.teralexi/hooks.json` and `<cwd>/.teralexi/hooks.json` with today's `{ hooks: [{ event, command, args? }] }` shape keep running with zero config changes (they become layer 2/3 in the merge instead of exclusive alternatives — strictly additive).
- [ ] `preHook`/`postHook` stored per-conversation in SQLite via `SetConversationHooks` keep working — no schema migration needed, `ConversationHookEvent` stays `'preHook' | 'postHook'`.
- [ ] Existing hook scripts relying on stderr-blocking semantics are unaffected by the stdin/stdout addition.
- [ ] `beforeToolCall`/`afterToolCall` remain valid event names (aliased, not renamed) so existing configs referencing them keep matching.
- [ ] All 8 bundled skills ([skills/](../skills/)) load and run with no `extension.json` present — an `ExtensionManifest` is fully optional.
- [ ] Existing skill-authored `composerToolbarPlugins` exports in `actions/index.ts` ([composer-toolbar-plugin.ts](../src/main/skills/composer-toolbar-plugin.ts), [composer-toolbar-registry.ts](../src/main/skills/composer-toolbar-registry.ts)) keep working via the same registry, unchanged — `contributes.composerToolbarPlugins` in `extension.json` is an *additional*, optional way to declare the same thing for a non-skill Extension, not a replacement.

## 6. Distribution

Widen the ClawHub schema (currently skill-only, [clawhub-skill-lifecycle.ts](../src/main/skills/clawhub/clawhub-skill-lifecycle.ts)) with an `type: 'skill' | 'extension'` discriminator; `extension` entries carry an `ExtensionManifest` and go through the same semver-update-check and moderation pipeline already built. No new marketplace service.

## 7. Comparative grounding (Codex CLI / Cursor / Claude Code)

Summarized from current public docs (verified July 2026), used to justify §4's choices:

| | Cursor | Codex CLI | Claude Code | This RFC |
|---|---|---|---|---|
| Events | 6, mostly observational | 10, block/allow + context | 32, full JSON control | ~24 (11 aligned + 8 OpenFDE-specific), see §4.1 |
| Handler types | `command` only | `command` only (`prompt`/`agent` parsed, not executed) | `command`, `http`, `mcp_tool`, `prompt`, `agent` | `command`, `function` (native sandbox reuse), `prompt`, `agent` |
| Trust model | none | hash-based review, `/hooks` CLI, managed policy | same as Codex | hash-based review via Settings UI, managed policy file |
| Bundling | not distributable | ships with a plugin manifest | first-class part of a plugin bundle | first-class `contributes.hooks` in `ExtensionManifest` |
| Unique to this platform | `beforeReadFile` (secret redaction before LLM sees file) | — | — | `ChannelMessageSend/Received`, `MemoryWrite/Recall`, `SkillInstall/Update`, `WorkflowDeploy/Run` |

Codex and Claude Code converged independently on the same event names and JSON contract — that convergence, not either tool individually, is what §4.1's aligned events are modeled on. Cursor's `beforeReadFile` has no direct analog in the aligned set but is folded conceptually into `PreToolUse` matching on file-read tools, since OpenFDE's tool-call hook already fires before *every* tool including file reads — a dedicated event isn't needed where the general one already covers it.

## 8. Phased rollout

1. **Phase 0 (done)** — current state described in §1; no code change.
2. **Phase 1 (done)** — `ExtensionManifest` type + skill-sdk exports; extension discovery loader.
3. **Phase 2 (done)** — Hook subsystem core: layered config resolution (§4.3), stdin/stdout upgrade (§4.4), `PreMcpToolUse`/`PostMcpToolUse`, extension host wiring, `hookSpecificOutput` consumption, `onApprovalRequired` dispatch, trust review store + Settings UI.
4. **Phase 3 (done)** — `prompt`/`agent` hook bindings + JSON `function` module pointers (`hook-prompt-executor.ts`, `hook-agent-executor.ts`); managed policy file still deferred.
5. **Phase 4 (partial)** — `llmProviders`/`channels`/`uiPanels` contributions from trusted `actions/index.ts` (`extension-contributions-registry.ts`); renderer dynamic panel import still deferred.
6. **Phase 5 (deferred)** — OpenFDE-specific events (`ChannelMessageSend/Received`, `MemoryWrite/Recall`, `SkillInstall/Update`, `WorkflowDeploy/Run`) + ClawHub `extension` type.

## 9. Testing strategy

Follow the existing co-located pattern (`*.test.ts` unit next to source, `*.integration.test.ts` for filesystem/module-loading — see [skills-directory-loader.test.ts](../src/main/skills/skills-directory-loader.test.ts) as the template):
- `user-hooks.test.ts` (exists) gains cases for layered config merge and stdout-JSON parsing, keeping all current stderr-blocking cases green.
- New `hook-dispatcher.integration.test.ts` for the trust/review gate (pending → trusted → runs).
- Registry generalization (`llm-provider-registry`, `channel-registry`) tested the same way `channel-registry.test.ts` presumably already tests `ChannelRegistry.register/get`.

## 11. Worked examples (bundled)

Four extensions ship under `extensions/` and are registered at build time via `generate-bundled-extensions.ts`. See [`extensions/README.md`](../extensions/README.md) for the author guide.

| Extension | Contribution kinds |
|-----------|-------------------|
| `secret-guard` | `command` + `function` hooks |
| `hook-judge` | `function-ref` + `prompt` hooks |
| `demo-channel` | `channels` + `uiPanels` |
| `demo-llm` | `llmProviders` |

### 11.1 Hooks-only extension — `secret-guard`

Blocks any tool call whose input contains a path to a credentials file, and logs every tool call to a local audit file. Two handler types in one extension to show both: `command` (existing shape, just relocated) and `function` (new, runs in-process via the same sandbox `actions/*.ts` already uses).

```
extensions/secret-guard/
  extension.json
  hooks/hooks.json
  scripts/block-secret-paths.sh
  actions/index.ts
```

```jsonc
// extensions/secret-guard/extension.json
{
  "id": "secret-guard",
  "version": "1.0.0",
  "permissions": { "filesystem": "workspace", "shell": false, "network": false }
}
```

```jsonc
// extensions/secret-guard/hooks/hooks.json — identical shape to today's ~/.teralexi/hooks.json
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

```bash
#!/bin/bash
# extensions/secret-guard/scripts/block-secret-paths.sh
# Existing contract, unchanged: JSON payload is argv[last]; non-empty stderr
# blocks the tool call because PreToolUse is in BLOCKING_HOOK_EVENTS.
payload="${@: -1}"
path=$(echo "$payload" | jq -r '.toolInput.path // .toolInput.filePath // empty')

if [[ "$path" == *".env"* || "$path" == *"credentials"* ]]; then
  echo "Blocked: tool tried to read a credentials-looking path: $path" >&2
  exit 1
fi
exit 0
```

```ts
// extensions/secret-guard/actions/index.ts
// `function`-type hook — no subprocess, runs in the same sandboxed require()
// skill-module-loader.ts already uses for skill actions/index.ts today.
import type { HookHandler } from '@teralexi/extension-sdk'

export const hooks: Record<string, HookHandler> = {
  PostToolUse: async (ctx) => {
    // Audit log — observational, PostToolUse is not a blocking event by default.
    await appendAuditLog({
      tool: ctx.toolName,
      conversationId: ctx.conversationId,
      at: new Date().toISOString(),
    })
    return { continue: true }
  },
}

async function appendAuditLog(entry: unknown): Promise<void> {
  const { appendFile } = await import('node:fs/promises')
  await appendFile(
    `${process.env.TERALEXI_HOME}/audit.log`,
    JSON.stringify(entry) + '\n',
  )
}
```

### 11.2 Channel + UI extension — `demo-channel`

Bundled sample that registers a log channel and a settings panel (metadata only in renderer today).

```
extensions/demo-channel/
  extension.json
  actions/index.ts
  ui/DemoChannelPanel.vue
```

```ts
// extensions/demo-channel/actions/index.ts
import type { ExtensionChannelSender, UiPanelContribution } from '@teralexi/skill-sdk'

export const channels: Record<string, ExtensionChannelSender> = {
  log: {
    async sendToTarget(target, text) {
      // appends to ~/.teralexi/demo-channel.log
    },
  },
}

export const uiPanels: Record<string, UiPanelContribution> = {
  settings: { label: 'Demo Channel', component: 'ui/DemoChannelPanel.vue' },
}
```

Registered in `ChannelRegistry` as `demo-channel:log`.

### 11.3 LLM provider extension — `demo-llm`

```
extensions/demo-llm/
  extension.json
  actions/index.ts
```

```ts
// extensions/demo-llm/actions/index.ts
import type { ExtensionProviderAdapter, LlmProviderContribution } from '@teralexi/skill-sdk'

class DemoLlmAdapter implements ExtensionProviderAdapter {
  createModel(modelId: string, creds: unknown) {
    return { modelId, creds, demo: true }  // stub — real extensions return LanguageModel
  }
}

export const llmProviders: Record<string, LlmProviderContribution> = {
  local: {
    label: 'Demo LLM (stub)',
    adapter: new DemoLlmAdapter(),
    credentialFields: ['demoApiKey', 'demoBaseURL'],
  },
}
```

Registered as `demo-llm:local`; resolved by `createModelForProvider()` via `extension-llm-provider-registry.ts`.

### 11.4 Hook judge extension — `hook-judge`

Demonstrates `function-ref` (fast in-process guard) and `prompt` (LLM on approval).

```
extensions/hook-judge/
  extension.json          # contributes.hooks.onApprovalRequired → prompt
  hooks/hooks.json        # PreToolUse → function-ref → actions/guard.ts
  actions/guard.ts
```

### 11.5 Reference — `matrix-bridge` (not bundled)

The following was the original RFC sketch for a Matrix channel; use `demo-channel` as the working template.

```
extensions/matrix-bridge/
  extension.json
  actions/index.ts
```

```jsonc
// extensions/matrix-bridge/extension.json
{
  "id": "matrix-bridge",
  "version": "0.1.0",
  "activationEvents": ["onStartup"],
  "permissions": { "network": true, "credentials": ["matrix-access-token"] }
}
```

```ts
// extensions/matrix-bridge/actions/index.ts
import type { ChannelMessageSender } from '@main/channels/framework/channel-registry'
import type { HookHandler } from '@teralexi/extension-sdk'

// Same interface every built-in channel manager.ts already implements —
// sendToTarget(target, text): Promise<void> — see channel-registry.ts:3-5.
class MatrixSender implements ChannelMessageSender {
  async sendToTarget(target: string, text: string): Promise<void> {
    const token = process.env.MATRIX_ACCESS_TOKEN
    await fetch(`https://matrix.example.org/_matrix/client/v3/rooms/${target}/send/m.room.message`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: text }),
    })
  }
}

// contributes.channels — registered into ChannelRegistry under id "matrix"
export const channels = {
  matrix: new MatrixSender(),
}

// contributes.hooks.ChannelMessageSend — fires for every channel, filtered by
// ctx.channelId so this extension only touches its own channel's outbound text.
const API_KEY_PATTERN = /(sk-|ghp_|xox[baprs]-)[A-Za-z0-9]{10,}/g

export const hooks: Record<string, HookHandler> = {
  ChannelMessageSend: async (ctx) => {
    if (ctx.channelId !== 'matrix') return { continue: true }
    const redacted = (ctx.text as string).replace(API_KEY_PATTERN, '[redacted]')
    return { continue: true, hookSpecificOutput: { updatedInput: { text: redacted } } }
  },
}
```

### 11.6 Reference — `vllm-provider` (not bundled)

The following was the original RFC sketch for a vLLM provider; use `demo-llm` as the working template.

```
extensions/vllm-provider/
  extension.json
  actions/index.ts
```

```jsonc
// extensions/vllm-provider/extension.json
{
  "id": "vllm-provider",
  "version": "1.0.0",
  "permissions": { "network": true }
}
```

```ts
// extensions/vllm-provider/actions/index.ts
import { createOpenAICompatible } from '@teralexi-ai'
import type { ProviderAdapter, ProviderCredentials } from '@teralexi/extension-sdk'

// Identical shape to LlamaCppAdapter (adapters.ts:34-42) — vLLM's server is
// OpenAI-compatible, so this is a ~10-line adapter, not a new integration.
class VllmAdapter implements ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createOpenAICompatible({
      name: 'vllm',
      apiKey: creds.vllmApiKey?.trim() || 'not-needed',
      baseURL: creds.vllmBaseURL,
    })(modelId)
  }
}

// contributes.llmProviders — registered into the new LlmProviderRegistry (§3),
// which is what makes LLM_PROVIDER_IDS extension-populated instead of a closed
// union going forward.
export const llmProviders = {
  vllm: {
    label: 'vLLM (self-hosted)',
    adapter: new VllmAdapter(),
    credentialFields: ['vllmBaseURL', 'vllmApiKey'],
  },
}
```

## 12. Open decisions

1. Should `PreMcpToolUse`/`PostMcpToolUse` block by default like `beforeToolCall` does, or default to observational — MCP servers are third-party processes already outside the trust boundary, arguably warranting stricter default than in-repo toolSet tools.
2. Where does `ChannelMessageReceived` sit relative to per-channel rate limiting that may already exist informally in each `manager.ts` — needs a read of `src/main/channels/*/manager.ts` before Phase 5 to avoid double rate-limiting.
3. Managed policy file format — reuse `config/config.properties` (Java-properties style, already used for OAuth creds) or introduce TOML (matches Codex's `requirements.toml` precedent) — recommend properties-style for consistency with [config/system-prop.ts](../config/system-prop.ts) rather than adding a second config-file syntax to the project.
