# OpenFDE

<!-- ci-status-start -->
[![CI](https://github.com/Naughty-Otters/OpenFDE/actions/workflows/ci.yml/badge.svg)](https://github.com/Naughty-Otters/OpenFDE/actions/workflows/ci.yml)

| | |
| --- | --- |
| **Last successful build** | 2026-06-22T00:32:12Z |
| **Branch** | `main` |
| **Commit** | [`e80d1e5`](https://github.com/Naughty-Otters/OpenFDE/commit/e80d1e5b33948b959991298af0f5d3f1273f2d97) |
| **Workflow run** | [View logs](https://github.com/Naughty-Otters/OpenFDE/actions/runs/27921877275) |
<!-- ci-status-end -->

OpenFDE is an Electron desktop app for running and managing AI agents in a local desktop workspace. It combines a Vue 3 renderer, Electron main process services, persisted conversations, tool execution, MCP integrations, scheduled jobs, and channel/account integrations inside one desktop app.

[For Chinese Developers](./README_ZH.md)

## Highlights
- Multi-agent chat UI with conversation history and in-app settings
- Provider support for Ollama, OpenAI, Anthropic, and Gemini
- Tool approvals, collect-form interactions, and sandbox result/report panels
- MCP server management and shared tool-set integrations
- Extensible agent skills (bundled defaults + user skills under `~/.openfde/skills/`)
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

# run the desktop app in development
npm run dev

# run the renderer/main/preload build used by CI validation
npm run build:web

# build the production desktop app
npm run build
```

## Useful Scripts
```bash
# development
npm run dev

# production builds
npm run build
npm run build:web
npm run build:mac
npm run build:win32
npm run build:win64
npm run build:dir

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
CI runs in `.github/workflows/ci.yml` on pushes and pull requests to `main`, `master`, and `mini-main`:

1. **Unit tests** (Ubuntu) — `npm run test:unit:coverage`; uploads the `coverage/` artifact.
2. **Production build** (macOS, Windows, Linux in parallel) — platform-specific `build:*` scripts; uploads internal artifacts (`openfde-<platform>-ci-<run>-<sha>`, 14-day retention). Download from **Actions → workflow run → Artifacts**.
3. **Update README** (Ubuntu, push only) — after a successful build, updates the CI status table at the top of this file (commit uses `[skip ci]` to avoid loops).

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

Agent skills are markdown folders that define workflows, tools, forms, and reference assets. Bundled skills ship in [`skills/`](./skills/) (including **default** and **github**); install your own under `~/.openfde/skills/` (same folder id overrides bundled defaults).

**[→ Step-by-step skill development guide](./skills/SKILL-DEVELOPMENT.md)**

## Coding guide

UI and implementation notes for contributors (file-change diff UI, HITL preview IPC, shared types):

**[→ CODING.md](./CODING.md)**

## Notes
- CI uses Node.js 22.x to match local development requirements.
- Download coverage HTML from the workflow artifact after a CI run if you need a local report without running tests.

## License

OpenFDE is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

You may use, modify, and distribute the software for **noncommercial purposes**, including personal use, learning, hobby projects, and noncommercial use by educational and nonprofit organizations.

**Commercial use** (including commercial distribution, SaaS/hosted services, resale, or integration into commercial products) and **any other use beyond the noncommercial terms** require a separate written license from the copyright holder. Contact the project owner via [GitHub Issues](https://github.com/Naughty-Otters/OpenFDE/issues).
