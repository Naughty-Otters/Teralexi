# Changelog

All notable changes to teralexi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Vector memory staging: successful ReAct runs can index user/assistant turns in
  `~/.teralexi/memory/memory-vectors.db` (embedding retrieval not wired yet).
- Consolidated memory settings under `memory.recording.*` and `memory.retention.*`
  with a single Settings → Memory panel (recording layers + retention limits).
- **Vector index** toggle (`memory.recording.vector`); off by default until
  semantic recall ships. Requires **Block** recording. Legacy
  `memory.vector.writeEnabled` is still read for migration.
- Explore-phase manifest (`plans/manifest.json`) built at plan exit and injected
  into execution todo instructions — includes workspace files, repo searches, and
  remote resources (`web_search`, `web_scrape`, `deep_research`).

### Changed

- `list_files`, `grep_files`, `glob_files`, and `search_files` accept
  `include_package_files` (default `false`) to omit `node_modules`, Python package
  dirs (`venv`, `site-packages`, `__pycache__`, etc.), and hidden paths from
  scan results.
- Plan mode keeps a single `plans/<slug>.md` per conversation: the slug is assigned once,
  stale plan markdown files are pruned on sync, and explore-mode file writes target only
  the canonical plan file (use `update_todos` for step sync).
- `grep_files` accepts a file path (not only a directory) and searches that single file.
- `update_todos` is allowed during approved plan execution tool loops; the foreach batch
  resyncs from disk when the todo list length changes.
- Chat scroll window no longer grows unbounded when new messages arrive while the user
  is reading older history (still capped at `CHAT_MESSAGE_WINDOW_MAX` rows in the DOM).
- Chat UI coalesces high-frequency agent stream IPC to animation frames: throttled
  conversation snapshots, incremental message normalization, streaming text buffer,
  settled markdown HTML cache, batched Pinia store sync, and backpressure “catching up”
  indicator during extreme bursts.
- `read_file` accepts optional `reason` for intentional re-reads; repeat reads of
  the same path+offset+limit are blocked unless `reason` is set or a new `offset`
  is used for pagination.
- Repeat `read_file` / grep / glob / web tool calls in the same user turn return
  compact stubs instead of full bodies in the LLM context; a session read ledger
  is injected into planning and todo loops listing paths already loaded.
- Workspace file navigator supports folder navigation with breadcrumbs (list
  children per directory instead of a flat root-only view).
- Workspace git diff panel shows untracked new files with syntax-highlighted
  additions and fills the available diff pane height.
- Chat UI is locked to conversation display mode (brief/timeline code kept; mode
  toggle hidden). Message list uses a rolling scroll window with paginated DB
  loads so long threads stay responsive.
- Plan todo foreach syncs `plans/todos.json` before each item, stops the batch when
  all tasks are done on disk, and blocks only `enter_plan_mode` during execution
  (`update_todos` and `exit_plan_mode` remain available in tool loops).
- Agent memory persistence is re-enabled for the ReAct pipeline: completed runs with
  tool-loop (or other meaningful) output are written again; HITL-paused or aborted
  runs are skipped.
- Per-turn `read_file` cache with mtime invalidation across tool-loop retries and
  plan todos.
- Shared tool-input dedupe across tool-loop streams in the same user turn, with
  path-normalized keys for `read_file`, `grep_files`, and `glob_files`.
- Prompt guidance against redundant file reads in explore/plan mode and the coding
  skill.
- Pre-flight tool-result pruning keeps `read_file` summaries as path + first 500
  chars + “(full content pruned)” so the model knows a file was already loaded.

### Fixed

- `ensureDir` no longer misroutes app paths (e.g. `memory/`, `db/`) into channel
  data folders; fixes memory block writes and plan-mode tools (`enter_plan_mode`,
  `exit_plan_mode`) failing with “Cannot open database because the directory does
  not exist”.
- All app SQLite opens go through `openAppSqliteDatabase`, which ensures parent
  directories exist; `teralexi-home` path helpers for db, config, workspace,
  logs, and memory also create dirs on access.
- Skill/toolSet esbuild cache now fingerprints bundled inputs and rebuilds when
  shared deps change; cache is cleared on app startup so plan-mode tools pick up
  current `ConversationStore` / DB path code.

## [0.0.1] - 2026-06-08

### Added

- Initial pre-release build of teralexi desktop app.
- GitHub Releases auto-update pipeline (placeholder repo until official release).
- Settings → About panel with manual update check and install flow.
