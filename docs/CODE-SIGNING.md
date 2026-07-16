# Code signing overview

Teralexi signs installers at **build time only** via [electron-builder](https://www.electron.build/code-signing). Signing config is **never baked into the app** and **never packaged** in the installer.

**macOS and Windows are separate processes** — use the platform-specific guide:

| Platform | Guide |
| --- | --- |
| **macOS** (Developer ID + notarization) | **[CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md)** |
| **Windows** (Authenticode `.pfx` or Azure Trusted Signing) | **[CODE-SIGNING-WINDOWS.md](./CODE-SIGNING-WINDOWS.md)** |

## Where credentials live

| Where | Used for |
| --- | --- |
| **`env/.signing.env`** (gitignored) | Local `npm run build:*` / `release:*` — **both sit and prod** |
| **Shell exports** | Override `.signing.env` when needed |
| **GitHub Actions secrets** | CI and Release workflows |

Do **not** commit `.p12` / `.pfx` files, passwords, or `env/.signing.env`.

Runtime user settings belong in `~/.teralexi/config/config.properties`.

## Quick start (local)

```bash
cp env/.signing.env.example env/.signing.env
# Add MAC_SIGN_* / MAC_APPLE_* (macOS) and/or WIN_SIGN_* / AZURE_* (Windows)
```

See `env/.signing.env.example` for commented templates. Process environment variables override `.signing.env`.

## Build scripts

All `npm run build:*` and `npm run release:*` scripts use `scripts/run-electron-builder.ts`, which loads `env/.signing.env` then process env before calling electron-builder. App config (`BASE_API`, etc.) still comes from `env/.{dev|sit|prod}.env`.

Unsigned builds still work when `.signing.env` is missing or secrets are absent in CI.

## GitHub Actions workflows

Each runner receives **only its platform's** signing credentials (macOS job never gets Windows `.pfx`, and vice versa).

| Workflow | Trigger | Build env | macOS | Windows | S3 prefix | Signing |
| --- | --- | --- | --- | --- | --- | --- |
| **CI** | PR, push, manual | `sit` / `.sit.env` | `build:mac:sit` | `build:win64:sit` | — (artifacts only) | mac + win |
| **Release** | manual (`release` + platform `all`/`mac`/`win`) | `prod` / `.prod.env` | `release:mac` | `release:win` | `stable/` | selected platform(s) + notarize (mac) |

If signing secrets are missing, workflows still produce unsigned installers.

Platform-specific secret lists:
- macOS → [CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md#github-actions-secrets)
- Windows → [CODE-SIGNING-WINDOWS.md](./CODE-SIGNING-WINDOWS.md)

## Verify signed artifacts

`scripts/verify-signing.mjs` runs platform-appropriate checks against `.app` / `.dmg` / `.exe` artifacts in `build/`:

```bash
npm run verify:signing
node scripts/verify-signing.mjs --dir build --strict   # fail on warnings
node scripts/verify-signing.mjs --json
```

- macOS checks run only on macOS → [manual steps](./CODE-SIGNING-APPLE.md#verify-a-signed-macos-app)
- Windows Authenticode checks need `powershell` / `signtool` → [manual steps](./CODE-SIGNING-WINDOWS.md#verify-a-signed-windows-installer)

## Related

- [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md)
- [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md)
- [RELEASE.md](./RELEASE.md)
