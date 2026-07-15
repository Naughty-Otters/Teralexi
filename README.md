# Teralexi

<!-- ci-status-start -->
[![CI](https://github.com/Naughty-Otters/OpenFDE/actions/workflows/ci.yml/badge.svg)](https://github.com/Naughty-Otters/OpenFDE/actions/workflows/ci.yml)

| | |
| --- | --- |
| **Last successful build** | 2026-07-13T18:12:46Z |
| **Branch** | `main` |
| **Commit** | [`c322adb`](https://github.com/Naughty-Otters/OpenFDE/commit/c322adb21cfab848018fb484484caf2f19fff059) |
| **Workflow run** | [View logs](https://github.com/Naughty-Otters/OpenFDE/actions/runs/29272495336) |
<!-- ci-status-end -->

Teralexi is an Electron desktop app for running and managing AI agents in a local desktop workspace. It combines a Vue 3 renderer, Electron main process services, persisted conversations, tool execution, MCP integrations, scheduled jobs, and channel/account integrations inside one desktop app.

[For Chinese Developers](./README_ZH.md)

## Highlights
- Multi-agent chat UI with conversation history and in-app settings
- Provider support for Ollama, OpenAI, Anthropic, and Gemini
- Tool approvals, collect-form interactions, and sandbox result/report panels
- MCP server management and shared tool-set integrations
- Extensible agent skills (bundled defaults + user skills under `~/.teralexi/skills/`)
- Scheduler support for recurring actions
- Desktop integrations including tray behavior, updates, downloads, and Google/WhatsApp flows

## Tech Stack
- `electron`
- `vue`
- `vite`
- `pinia`
- `@nuxt/ui`
- `typescript`
- `better-sqlite3`
- `vitest`

## Requirements
- Node.js `22` or newer
- `npm` as the package manager

## Getting Started
```bash
# install dependencies
npm install

# run the desktop app in development (uses env/.dev.env)
npm run dev

# run the renderer/main/preload build used by CI validation
npm run build:web

# build the production desktop app (uses env/.prod.env)
npm run build
```

For environment files, staging vs production builds, and GitHub Actions, see **[BUILD-AND-RELEASE.md](./BUILD-AND-RELEASE.md)**.

## Useful Scripts
```bash
# development
npm run dev

# production builds (env/.prod.env)
npm run build
npm run build:web
npm run build:mac
npm run build:win32
npm run build:win64
npm run build:dir

# staging / SIT builds (env/.sit.env)
npm run build:sit
npm run build:mac:sit
npm run build:win64:sit

# testing
npm run test
npm run test:unit
npm run test:unit:coverage
npm run test:unit:watch
```

## Unit Testing
Unit tests use [Vitest](https://vitest.dev/) with co-located `*.test.ts` files next to each module.

- Run tests: `npm run test:unit`
- Run tests with coverage (enforced thresholds): `npm run test:unit:coverage`
- Watch mode: `npm run test:unit:watch`
- Config: `vitest.config.ts`, setup: `vitest.setup.ts`
- Patterns: `src/**/*.test.ts`, `skills/**/*.test.ts`, `config/**/*.test.ts`, `.electron-vite/**/*.test.ts`

CI enforces **70%** line, statement, and function coverage on unit-testable code. Integration boundaries (Electron IPC, SQLite store, WhatsApp, full agent flow orchestration, shell subprocess tools) are excluded from that gate; see `coverage.exclude` in `vitest.config.ts`. Per-area floors in `coverage.thresholds` also use **70%** for lines, statements, and functions.

## GitHub Actions

Both workflows are triggered manually from the **Actions** tab. See **[BUILD-AND-RELEASE.md](./BUILD-AND-RELEASE.md)** for full details.

| Workflow | Purpose | Environment |
| --- | --- | --- |
| [CI](.github/workflows/ci.yml) | Unit tests + internal desktop builds | Staging (`env/.sit.env`) |
| [Release](.github/workflows/release.yml) | Build production installers and upload to private S3 | Production (`env/.prod.env`) |

**CI** (manual `workflow_dispatch`):

1. **Unit tests** (Windows) — `npm run test:unit`.
2. **Staging build** (macOS + Windows) — `build:mac:sit` / `build:win64:sit`; uploads `teralexi-<platform>-sit-<run>-<sha>` artifacts (14-day retention).
3. **Update README** — refreshes the CI status table at the top of this file.

**Release** (manual `workflow_dispatch`, confirm input `release`):

- Production builds via `release:mac` / `release:win`, then `release:upload-s3` to private S3. Clients fetch updates from public `{BASE_API}/desktop/releases/stable/` (see [docs/DESKTOP-RELEASES.md](./docs/DESKTOP-RELEASES.md)).

## Project Layout
```text
src/main/         Electron main-process code and desktop services
src/preload/      Preload bridge exposed to the renderer
src/renderer/     Vue app, views, components, store, and UI utilities
src/ipc/          Shared IPC channel definitions
skills/           Skill and tool-set definitions used by agents (see [Skill development guide](./skills/SKILL-DEVELOPMENT.md))
.github/workflows CI workflows
```

## Skill development

Agent skills are markdown folders that define workflows, tools, forms, and reference assets. Bundled skills ship in [`skills/`](./skills/) (including **default** and **github**); install your own under `~/.teralexi/skills/` (same folder id overrides bundled defaults).

**[→ Step-by-step skill development guide](./skills/SKILL-DEVELOPMENT.md)**

## Coding guide

UI and implementation notes for contributors (file-change diff UI, HITL preview IPC, shared types):

**[→ CODING.md](./CODING.md)**

## Build & release

Environment files (`env/.dev.env`, `env/.sit.env`, `env/.prod.env`), local build commands, and GitHub Actions workflows:

**[→ BUILD-AND-RELEASE.md](./BUILD-AND-RELEASE.md)**

## Notes
- CI uses Node.js 22.x to match local development requirements.
- Run `npm run test:unit:coverage` locally when you need the coverage HTML report.

## License

Teralexi is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

You may use, modify, and distribute the software for **noncommercial purposes**, including personal use, learning, hobby projects, and noncommercial use by educational and nonprofit organizations.

**Commercial use** (including commercial distribution, SaaS/hosted services, resale, or integration into commercial products) and **any other use beyond the noncommercial terms** require a separate written license from the copyright holder. Contact the project owner via [GitHub Issues](https://github.com/Naughty-Otters/Teralexi/issues).
