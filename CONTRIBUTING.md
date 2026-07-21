# Contributing to Teralexi

Thanks for your interest in contributing. This repo is the **Teralexi desktop** app (Electron + Vue).

## Prerequisites

- **Node.js 22+** and `npm`
- macOS, Windows, or Linux for `npm run dev`

## Quick start

```bash
npm install
npm run dev
```

By default, `npm run dev` uses `env/.dev.env`, which points `BASE_API` at the public Teralexi platform (`https://api.teralexi.com/`). That enables sign-in, entitlements, metrics, support upload, website publish, and update checks against the hosted API.

### Local-only / your own API

| Goal | How |
| --- | --- |
| Point at a local platform API | `cp env/.dev.local.env.example env/.env`, set `BASE_API=http://localhost:8000`, then `npm run dev` |
| One-off override | `BASE_API=http://localhost:8000 npm run dev` |
| Skip cloud features | Leave `BASE_API` empty in an override env file; use local LLMs (Ollama / llama.cpp) from Settings → LLM. Sign-in, auto-update, support upload, and website publish will not work without a compatible API. |

Load order for `npm run dev`: `env/.dev.env` → `env/.env` (wins) → `env/.dev.local.env` (wins if present).

The platform backend is **not** in this repository. Client contracts live under [`docs/SUBSCRIPTION-INTEGRATION.md`](./docs/SUBSCRIPTION-INTEGRATION.md) and related docs.

## Development tips

- UI / IPC conventions: [`CODING.md`](./CODING.md)
- Skills: [`skills/SKILL-DEVELOPMENT.md`](./skills/SKILL-DEVELOPMENT.md)
- Builds & release: [`BUILD-AND-RELEASE.md`](./BUILD-AND-RELEASE.md)

## Tests

```bash
npm run test:unit
```

CI runs unit tests and coverage checks on pull requests. Prefer focused tests next to the code you change (`*.test.ts`).

## Pull requests

1. Fork and branch from `main`.
2. Keep changes focused; update docs when behavior or contracts change.
3. Do **not** commit secrets (`env/.signing.env`, `.p12`, `.pfx`, private keys, OAuth client secrets).
4. Open a PR against `main` and ensure CI is green.

## Code of conduct

By participating, you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

Contributions are accepted under the [Apache License 2.0](./LICENSE).
