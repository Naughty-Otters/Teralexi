# Code signing (macOS + Windows)

OpenFDE uses [electron-builder](https://www.electron.build/code-signing) signing env vars at **build time**. Configure them in `**~/.openfde/config/.env`** (recommended for local secrets) or GitHub Actions secrets for **Release** and **CI** workflows.

Do **not** commit `.p12` / `.pfx` files or passwords to the repo.

## Local configuration (`~/.openfde/config/.env`)

### macOS (Developer ID + notarization)

Required for in-app auto-update install on macOS.

**Option A — Keychain identity**

```properties
MAC_SIGN_IDENTITY = 'Developer ID Application: Your Name (TEAMID)'
```

List identities: `security find-identity -v -p codesigning`

**Option B — `.p12` file**

```properties
MAC_SIGN_CERTIFICATE = '~/certs/openfde.p12'
MAC_SIGN_CERTIFICATE_PASSWORD = 'your-p12-password'
MAC_SIGN_IDENTITY = 'Developer ID Application: Your Name (TEAMID)'
```

**Notarization**

```properties
MAC_APPLE_ID = 'you@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'xxxx-xxxx-xxxx-xxxx'
MAC_APPLE_TEAM_ID = 'TEAMID'
```

When all three Apple vars are set, builds pass `--config.mac.notarize=true` automatically.

### Windows (Authenticode)

```properties
WIN_SIGN_CERTIFICATE = '~/certs/openfde.pfx'
WIN_SIGN_CERTIFICATE_PASSWORD = 'your-pfx-password'
```

On Windows runners / local Windows builds, `WIN_SIGN_*` is mapped to `CSC_LINK` for electron-builder. When cross-building Windows from macOS, electron-builder uses `WIN_CSC_LINK` directly.

## Friendly alias reference


| Alias                             | electron-builder                         |
| --------------------------------- | ---------------------------------------- |
| `MAC_SIGN_CERTIFICATE`            | `CSC_LINK` (macOS `.p12`)                |
| `MAC_SIGN_CERTIFICATE_PASSWORD`   | `CSC_KEY_PASSWORD`                       |
| `MAC_SIGN_IDENTITY`               | `CSC_NAME`                               |
| `MAC_APPLE_ID`                    | `APPLE_ID`                               |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_APP_SPECIFIC_PASSWORD`            |
| `MAC_APPLE_TEAM_ID`               | `APPLE_TEAM_ID`                          |
| `WIN_SIGN_CERTIFICATE`            | `WIN_CSC_LINK` (`.pfx`, or base64 in CI) |
| `WIN_SIGN_CERTIFICATE_PASSWORD`   | `WIN_CSC_KEY_PASSWORD`                   |


You can also set `CSC_*`, `WIN_CSC_*`, and `APPLE_*` directly.

## Local builds

```bash
export OPENFDE_BUILD_ENV=prod
npm run build:mac      # macOS
npm run build:win64    # Windows (on Windows or with WIN_SIGN_* when cross-building)
npm run release:mac
npm run release:win
```

All build scripts use `scripts/run-electron-builder.ts`, which loads signing env before calling electron-builder. Unsigned builds still work when secrets are unset.

## GitHub Actions secrets

Both **Release** (production → S3) and **CI** (staging artifacts) workflows use platform-specific signing. Each runner receives only its platform’s credentials (macOS job never gets Windows `.pfx`, and vice versa).

### macOS secrets


| Secret                          | Maps to                           | Purpose                      |
| ------------------------------- | --------------------------------- | ---------------------------- |
| `MAC_SIGN_CERTIFICATE_BASE64`   | `MAC_SIGN_CERTIFICATE`            | Base64 `.p12`                |
| `MAC_SIGN_CERTIFICATE_PASSWORD` | `MAC_SIGN_CERTIFICATE_PASSWORD`   | `.p12` password              |
| `MAC_SIGN_IDENTITY`             | `MAC_SIGN_IDENTITY`               | Developer ID identity string |
| `APPLE_ID`                      | `MAC_APPLE_ID`                    | Notarization                 |
| `APPLE_APP_SPECIFIC_PASSWORD`   | `MAC_APPLE_APP_SPECIFIC_PASSWORD` | Notarization                 |
| `APPLE_TEAM_ID`                 | `MAC_APPLE_TEAM_ID`               | Notarization                 |


Encode macOS certificate:

```bash
base64 -i openfde.p12 | pbcopy
```

### Windows secrets


| Secret                          | Maps to                         | Purpose         |
| ------------------------------- | ------------------------------- | --------------- |
| `WIN_SIGN_CERTIFICATE_BASE64`   | `WIN_SIGN_CERTIFICATE`          | Base64 `.pfx`   |
| `WIN_SIGN_CERTIFICATE_PASSWORD` | `WIN_SIGN_CERTIFICATE_PASSWORD` | `.pfx` password |


Encode Windows certificate:

```bash
# macOS / Linux
base64 -i openfde.pfx | pbcopy

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('openfde.pfx')) | Set-Clipboard
```

### Workflows


| Workflow    | Trigger            | Build env            | macOS           | Windows           | S3 prefix          | Signing              |
| ----------- | ------------------ | -------------------- | --------------- | ----------------- | ------------------ | -------------------- |
| **CI**      | PR, push, manual   | `sit` / `.sit.env`   | `build:mac:sit` | `build:win64:sit` | — (artifacts only) | mac + win            |
| **Release** | manual (`release`) | `prod` / `.prod.env` | `release:mac`   | `release:win`     | `stable/`          | mac + win + notarize |


If signing secrets are missing, workflows still produce unsigned installers.

### Unsigned vs signed builds (macOS + Windows)

OpenFDE defaults to **unsigned builds that launch locally** when no signing credentials are configured. When you provide keys in `~/.openfde/config/.env` (or CI secrets), the same build scripts sign automatically.

| Platform | Unsigned (no keys) | Signed (keys provided) |
| --- | --- | --- |
| **macOS** | `hardenedRuntime` disabled; app is ad-hoc re-signed in `afterSign` (before dmg/zip) and again post-build | `MAC_SIGN_IDENTITY` / `MAC_SIGN_CERTIFICATE` → Developer ID signing; `hardenedRuntime` stays enabled |
| **Windows** | `signAndEditExecutable` disabled → unsigned `.exe` / NSIS installer | `WIN_SIGN_CERTIFICATE` → Authenticode signing |

Friendly env vars (see table below) map to electron-builder `CSC_*` / `WIN_CSC_*` / `APPLE_*`. Auto-discovery of keychain certificates is **disabled** for unsigned platform builds so macOS does not partially sign with a stray cert.

**macOS unsigned manual fix** (only needed for artifacts built before this policy):

```bash
codesign --force --deep --sign - build/mac-arm64/OpenFDE.app
xattr -cr build/mac-arm64/OpenFDE.app
open build/mac-arm64/OpenFDE.app
```

For distribution to other machines, use Developer ID + notarization (macOS) or Authenticode (Windows).

## Related

- [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md)
- [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md)
- [RELEASE.md](./RELEASE.md)

