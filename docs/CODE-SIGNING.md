# Code signing (macOS + Windows)

Teralexi uses [electron-builder](https://www.electron.build/code-signing) signing env vars at **build time only**. Signing config is **never baked into the app** and **never packaged** in the installer.

| Where | Used for |
| --- | --- |
| **`env/.signing.env`** (gitignored) | Local `npm run build:*` / `release:*` — **both sit and prod** |
| **Shell exports** | Override `.signing.env` when needed |
| **GitHub Actions secrets** | CI and Release workflows |

Do **not** commit `.p12` / `.pfx` files, passwords, or `env/.signing.env`.

Runtime user settings belong in `~/.teralexi/config/config.properties`.

## Local configuration (`env/.signing.env`)

```bash
cp env/.signing.env.example env/.signing.env
# Edit env/.signing.env with your MAC_SIGN_* / WIN_SIGN_* values
```

Example `env/.signing.env`:

```properties
MAC_SIGN_IDENTITY = 'Your Name (TEAMID)'
MAC_APPLE_ID = 'you@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'xxxx-xxxx-xxxx-xxxx'
MAC_APPLE_TEAM_ID = 'TEAMID'
```

Process environment variables override `.signing.env` (useful for one-off tests).

### macOS (Developer ID + notarization)

Required for in-app auto-update install on macOS.

**Option A — Keychain identity** (recommended locally)

```properties
MAC_SIGN_IDENTITY = 'Your Name (TEAMID)'
```

Use the name from Keychain **without** the `Developer ID Application:` prefix — electron-builder adds that automatically. You can also paste the full Keychain string; Teralexi strips the prefix for you.

List identities: `security find-identity -v -p codesigning`

**Option B — `.p12` file** (CI or when cert is not in Keychain)

```properties
MAC_SIGN_CERTIFICATE = '~/certs/teralexi.p12'
MAC_SIGN_CERTIFICATE_PASSWORD = 'your-p12-password'
MAC_SIGN_IDENTITY = 'Your Name (TEAMID)'
```

**Notarization** (add to `env/.signing.env` for local prod releases)

```properties
MAC_APPLE_ID = 'you@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'xxxx-xxxx-xxxx-xxxx'
MAC_APPLE_TEAM_ID = 'TEAMID'
```

When all three Apple vars are set, builds notarize in the `afterSign` hook (with extended staple retries) and pass `--config.mac.notarize=false` so electron-builder does not staple with its shorter 3-attempt timeout.

### Windows (Authenticode `.pfx`)

```properties
WIN_SIGN_CERTIFICATE = '~/certs/teralexi.pfx'
WIN_SIGN_CERTIFICATE_PASSWORD = 'your-pfx-password'
```

On Windows runners / local Windows builds, `WIN_SIGN_*` is mapped to `CSC_LINK` for electron-builder. When cross-building Windows from macOS, electron-builder uses `WIN_CSC_LINK` directly.

### Windows (Azure Trusted Signing — remote, no `.pfx`)

Use [Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/) (formerly Trusted Signing) when you do not want to store a `.pfx` in CI. electron-builder 26+ signs via the `TrustedSigning` PowerShell module and Microsoft Entra app credentials.

**One-time Azure setup** (portal): register `Microsoft.CodeSigning`, create an Artifact Signing account + certificate profile, complete identity validation, create an App Registration with the **Artifact Signing Certificate Profile Signer** role, and create a client secret. See [Hendrik Erz’s guide](https://hendrik-erz.de/post/code-signing-with-azure-trusted-signing-on-github-actions).

**Local `env/.signing.env`:**

```properties
AZURE_TENANT_ID = 'your-entra-tenant-id'
AZURE_CLIENT_ID = 'your-app-registration-client-id'
AZURE_CLIENT_SECRET = 'your-client-secret-value'
AZURE_SIGNING_ENDPOINT = 'https://eus.codesigning.azure.net/'
AZURE_SIGNING_ACCOUNT_NAME = 'your-artifact-signing-account'
AZURE_SIGNING_CERTIFICATE_PROFILE = 'your-certificate-profile'
AZURE_SIGNING_PUBLISHER_NAME = 'Your Legal Name'
```

- `AZURE_SIGNING_PUBLISHER_NAME` must match the **Common Name** from your identity validation (your legal name or company).
- `AZURE_SIGNING_ENDPOINT` is the **Account URI** for your Artifact Signing account — shown on the account **Overview** page after you create it. It is tied to the Azure **region** you picked when creating the account (not something you invent). Examples: `https://eus.codesigning.azure.net/`, `https://wus2.codesigning.azure.net/`, `https://neu.codesigning.azure.net/`.
- `AZURE_SIGNING_ACCOUNT_NAME` is the **Artifact Signing account** name (not the App Registration name).
- `AZURE_SIGNING_CERTIFICATE_PROFILE` is the **certificate profile** name inside that account.

When all Azure variables are set, Teralexi passes `win.azureSignOptions` to electron-builder and skips the `.pfx` / self-signed paths. If both Azure and `WIN_SIGN_*` are configured, **Azure takes precedence**.

#### Required variables (all 7 must be present)

| Variable | Secret name (GitHub) | Where to find it |
| --- | --- | --- |
| `AZURE_TENANT_ID` | `AZURE_TENANT_ID` | Microsoft Entra ID → Overview → **Tenant ID** (directory ID) |
| `AZURE_CLIENT_ID` | `AZURE_CLIENT_ID` | App Registration → Overview → **Application (client) ID** |
| `AZURE_CLIENT_SECRET` | `AZURE_CLIENT_SECRET` | App Registration → Certificates & secrets → secret **Value** |
| `AZURE_SIGNING_ENDPOINT` | `AZURE_SIGNING_ENDPOINT` | Artifact Signing account → **Overview** → **Account URI** (see below) |
| `AZURE_SIGNING_ACCOUNT_NAME` | `AZURE_SIGNING_ACCOUNT_NAME` | Artifact Signing **account** resource name |
| `AZURE_SIGNING_CERTIFICATE_PROFILE` | `AZURE_SIGNING_CERTIFICATE_PROFILE` | Certificate **profile** name inside that account |
| `AZURE_SIGNING_PUBLISHER_NAME` | `AZURE_SIGNING_PUBLISHER_NAME` | Legal name from identity validation (certificate CN) |

If **any** `AZURE_*` variable is set, the build script validates **all seven** before signing and prints a prominent banner in the log:

- **All present** → `AZURE TRUSTED SIGNING: all required variables are present` (each field listed as `OK`)
- **Any missing** → `AZURE TRUSTED SIGNING: configuration incomplete` with per-field `OK` / `MISSING`, where to find each value, and which secrets are absent. The build **continues** but falls back to `.pfx` or self-signed/unsigned signing.

Look for this block near the top of the Windows build log (`[code-sign]` lines), right after dependency install and before `electron-builder` runs.

**Common mistakes**

| Mistake | Symptom |
| --- | --- |
| Using subscription ID instead of tenant ID | Auth fails in electron-builder / `Invoke-TrustedSigning` |
| Using App Registration **Object ID** instead of client ID | Auth fails |
| Copying secret **ID** instead of secret **Value** | Auth fails |
| Wrong endpoint region | Certificate profile not found |
| App Registration name instead of Artifact Signing account name | Signing account not found |
| Publisher name does not match identity validation CN | Signature rejected or publisher mismatch |
| Publisher name contains spaces (e.g. `Zhenqi Li`) | Must be quoted in electron-builder args — Teralexi handles this automatically; if you see `Unknown argument: li`, update to latest `run-electron-builder.ts` |

#### Troubleshooting: `403 (Forbidden)` on `Submitting digest for signing...`

If the build log shows Trusted Signing reached `Submitting digest for signing...` then failed with:

```
Azure.RequestFailedException: Service request failed.
Status: 403 (Forbidden)
...
SignTool Error: An unexpected internal error has occurred.
```

**Authentication worked** (tenant/client/secret are valid), but Azure **rejected the sign request**. This is almost always IAM or resource metadata — not an Teralexi/electron-builder bug.

**Checklist (in order):**

1. **Role on the App Registration, not your user account**  
   GitHub Actions signs as the **App Registration service principal** (`AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`). That app must have the role — not only your personal Microsoft account.

   - Azure Portal → **Artifact Signing account** (the resource, not Entra ID)
   - **Access control (IAM)** → **Role assignments**
   - Confirm an assignment exists for role **Artifact Signing Certificate Profile Signer** (formerly *Trusted Signing Certificate Profile Signer*)
   - **Member** must be your **App Registration** (search by app name under *User, group, or service principal* — apps only appear after you type the name)

   If the role is only on your user account, local portal tests may work but CI will 403.

2. **Role scope = Artifact Signing account**  
   The Signer role must be assigned **on the Artifact Signing account resource**. Assigning it only at subscription or resource-group scope is often insufficient.

3. **Endpoint region matches the account**  
   Compare the `Endpoint` in the build log metadata with the region shown on the certificate profile in Azure Portal. Examples:
   - East US → `https://eus.codesigning.azure.net/`
   - West US 2 → `https://wus2.codesigning.azure.net/`
   - North Europe → `https://neu.codesigning.azure.net/`  
   A region mismatch commonly produces **403** (not 404).

4. **Account and profile names are exact (case-sensitive)**  
   In the log metadata block, verify:
   - `CodeSigningAccountName` = Artifact Signing **account** resource name (Azure Portal → account → Overview → name)
   - `CertificateProfileName` = **Certificate profiles** tab → profile name  
   Do **not** use the App Registration name, email, or display name.

5. **Identity validation + profile status**  
   Artifact Signing account → **Identity validations** → status **Completed**  
   **Certificate profiles** → profile status **Active** (not pending / expired)

6. **Client secret not expired**  
   App Registration → Certificates & secrets → secret still valid; recreate and update `AZURE_CLIENT_SECRET` in GitHub if expired.

**Portal verification**

```
Artifact Signing account
  → Access control (IAM)
  → Role assignments
  → Filter: "Artifact Signing Certificate Profile Signer"
  → Member column should show your App Registration name (e.g. teralexi-code-sign-app)
```

**Still 403?** In Azure Portal, open the App Registration → **Enterprise applications** → find the service principal → copy its **Object ID** and confirm that exact principal appears in the IAM role assignment on the signing account. Re-assign the Signer role to the app if needed, wait a few minutes for propagation, then re-run the workflow.

**Local debug**

```bash
# 1) Verify all AZURE_* vars + Entra token (+ optional ARM profile check; works on Mac/Linux/Windows)
npm run verify:azure-signing

# 2) Dry-run Windows build config banner (Mac cannot sign; only checks env wiring)
npm run build:win64:sit
# Scan output for the AZURE TRUSTED SIGNING banner
```

`npm run verify:azure-signing` loads `env/.signing.env` (or exported env vars) and checks:

| Step | What it proves |
| --- | --- |
| Local banner | All 7 vars present; GUID/endpoint format valid |
| Entra token (required) | `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` are valid |
| ARM profile lookup (optional) | Account + profile exist when `AZURE_SUBSCRIPTION_ID` + `AZURE_RESOURCE_GROUP` are set |

The signing data plane has no public “GET profile” API, so step 2 does **not** call `eus.codesigning.azure.net` directly (that used to return HTTP 400 and falsely fail). After the codesigning token passes, confirm **Account URI**, account name, and profile name in Azure Portal.

It does **not** sign an `.exe` — TrustedSigning/signtool only runs on Windows. After `verify:azure-signing` passes on Mac, CI signing failures are usually IAM (403) or publisher-name mismatch, not missing secrets.

**Optional: curl token test (no repo script)**

```bash
source env/.signing.env  # or export vars manually
curl -sS -X POST "https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token" \
  -d "client_id=${AZURE_CLIENT_ID}" \
  -d "client_secret=${AZURE_CLIENT_SECRET}" \
  -d "scope=https://codesigning.azure.net/.default" \
  -d "grant_type=client_credentials" | jq -r '.access_token // .error_description'
```

A non-empty `access_token` means tenant/client/secret are good.

On GitHub Actions, confirm each `AZURE_*` secret exists in the job environment (`mac_signs` for CI staging builds, `release` for production releases) and that the Windows matrix job receives non-empty values (secrets are only injected on `matrix.platform == 'win'`).

#### Where to find the Endpoint (`AZURE_SIGNING_ENDPOINT`)

1. [Azure Portal](https://portal.azure.com) → search **Artifact Signing** (or *Trusted Signing*)
2. Open your **Artifact Signing account** (the resource you created, e.g. `teralexi`)
3. On **Overview**, find **Account URI** — that is your endpoint

Copy it exactly into `AZURE_SIGNING_ENDPOINT` / GitHub secret `AZURE_SIGNING_ENDPOINT`. A trailing slash is fine (`https://eus.codesigning.azure.net/`).

If you no longer see Overview, the URI is also in the resource **JSON** view as `accountUri`, or you can infer it from the **Location/Region** where you created the account:

| Azure region (examples) | Endpoint URI |
| --- | --- |
| East US | `https://eus.codesigning.azure.net/` |
| West US 2 | `https://wus2.codesigning.azure.net/` |
| West Central US | `https://wcus.codesigning.azure.net/` |
| North Europe | `https://neu.codesigning.azure.net/` |
| West Europe | `https://weu.codesigning.azure.net/` |

The endpoint **must match** the region where the account and certificate profile were created. A wrong region often causes **403 Forbidden** during signing.

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
| `AZURE_TENANT_ID`                 | (electron-builder env credential)        |
| `AZURE_CLIENT_ID`                 | (electron-builder env credential)        |
| `AZURE_CLIENT_SECRET`             | (electron-builder env credential)        |
| `AZURE_SIGNING_ENDPOINT`          | → `win.azureSignOptions.endpoint`        |
| `AZURE_SIGNING_ACCOUNT_NAME`      | → `win.azureSignOptions.codeSigningAccountName` |
| `AZURE_SIGNING_CERTIFICATE_PROFILE` | → `win.azureSignOptions.certificateProfileName` |
| `AZURE_SIGNING_PUBLISHER_NAME`    | → `win.azureSignOptions.publisherName`   |


You can also set `CSC_*`, `WIN_CSC_*`, and `APPLE_*` directly.

## Local builds

```bash
cp env/.signing.env.example env/.signing.env   # once
npm run build:mac:sit   # signed sit build (uses .sit.env + .signing.env)
npm run build:mac       # signed prod build (uses .prod.env + .signing.env)
npm run release:mac
```

All build scripts use `scripts/run-electron-builder.ts`, which loads `env/.signing.env` then process env before calling electron-builder. App config (`BASE_API`, etc.) still comes from `env/.{dev|sit|prod}.env`. Unsigned builds still work when `.signing.env` is missing.

## GitHub Actions secrets

Both **Release** (production → S3) and **CI** (staging artifacts) workflows use platform-specific signing. Each runner receives only its platform’s credentials (macOS job never gets Windows `.pfx`, and vice versa).

### macOS secrets


| Secret                          | Maps to                           | Purpose                      |
| ------------------------------- | --------------------------------- | ---------------------------- |
| `MAC_SIGN_CERTIFICATE_BASE64`   | `MAC_SIGN_CERTIFICATE`            | Base64 `.p12`                |
| `MAC_SIGN_CERTIFICATE_PASSWORD` | `MAC_SIGN_CERTIFICATE_PASSWORD`   | `.p12` password              |
| `MAC_SIGN_IDENTITY`             | `MAC_SIGN_IDENTITY`               | Developer ID identity string |
| `MAC_APPLE_ID`                  | `MAC_APPLE_ID`                    | Notarization                 |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | `MAC_APPLE_APP_SPECIFIC_PASSWORD` | Notarization               |
| `MAC_APPLE_TEAM_ID`             | `MAC_APPLE_TEAM_ID`               | Notarization                 |

Store these in the **`release`** environment (Settings → Environments → release). The Release job declares `environment: release`, so the workflow can only read them from there.


Encode macOS certificate:

```bash
base64 -i teralexi.p12 | pbcopy
```

### Windows secrets (`.pfx` **or** Azure Trusted Signing)

| Secret | Maps to | Purpose |
| --- | --- | --- |
| `WIN_SIGN_CERTIFICATE_BASE64` | `WIN_SIGN_CERTIFICATE` | Base64 `.pfx` (optional if using Azure) |
| `WIN_SIGN_CERTIFICATE_PASSWORD` | `WIN_SIGN_CERTIFICATE_PASSWORD` | `.pfx` password |
| `AZURE_TENANT_ID` | `AZURE_TENANT_ID` | Microsoft Entra tenant ID (Azure portal → Microsoft Entra ID) |
| `AZURE_CLIENT_ID` | `AZURE_CLIENT_ID` | App Registration **Application (client) ID** — not Object ID |
| `AZURE_CLIENT_SECRET` | `AZURE_CLIENT_SECRET` | App Registration client secret **Value** (shown once at creation) |
| `AZURE_SIGNING_ENDPOINT` | `AZURE_SIGNING_ENDPOINT` | Regional signing endpoint, e.g. `https://eus.codesigning.azure.net/` |
| `AZURE_SIGNING_ACCOUNT_NAME` | `AZURE_SIGNING_ACCOUNT_NAME` | Artifact Signing account name |
| `AZURE_SIGNING_CERTIFICATE_PROFILE` | `AZURE_SIGNING_CERTIFICATE_PROFILE` | Certificate profile name |
| `AZURE_SIGNING_PUBLISHER_NAME` | `AZURE_SIGNING_PUBLISHER_NAME` | Publisher CN from identity validation |

Store Windows signing secrets in the **`release`** environment (Release workflow) and **`mac_signs`** environment (CI build job), alongside the macOS secrets. The Windows runner receives only the `win` matrix secrets.

Encode Windows `.pfx` certificate:

```bash
# macOS / Linux
base64 -i teralexi.pfx | pbcopy

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('teralexi.pfx')) | Set-Clipboard
```

### Workflows


| Workflow    | Trigger            | Build env            | macOS           | Windows           | S3 prefix          | Signing              |
| ----------- | ------------------ | -------------------- | --------------- | ----------------- | ------------------ | -------------------- |
| **CI**      | PR, push, manual   | `sit` / `.sit.env`   | `build:mac:sit` | `build:win64:sit` | — (artifacts only) | mac + win            |
| **Release** | manual (`release`) | `prod` / `.prod.env` | `release:mac`   | `release:win`     | `stable/`          | mac + win + notarize |


If signing secrets are missing, workflows still produce unsigned installers.

### Unsigned vs signed builds (macOS + Windows)

Teralexi defaults to **unsigned builds that launch locally** when no signing credentials are configured. When you provide keys via shell env (or CI secrets), the same build scripts sign automatically.

| Platform | Unsigned (no keys) | Signed (keys provided) |
| --- | --- | --- |
| **macOS** | `hardenedRuntime` disabled; app is ad-hoc re-signed in `afterSign` (before dmg/zip) and again post-build | `MAC_SIGN_IDENTITY` / `MAC_SIGN_CERTIFICATE` → Developer ID signing; `hardenedRuntime` stays enabled |
| **Windows** | `signAndEditExecutable` disabled → unsigned `.exe` / NSIS installer | `WIN_SIGN_*` → Authenticode, or Azure Trusted Signing env vars → remote signing |

Friendly env vars (see table above) map to electron-builder `CSC_*` / `WIN_CSC_*` / `APPLE_*`. Auto-discovery of keychain certificates is **disabled** for unsigned platform builds so macOS does not partially sign with a stray cert.

**macOS unsigned manual fix** (only needed for artifacts built before this policy):

```bash
codesign --force --deep --sign - build/mac-arm64/Teralexi.app
xattr -cr build/mac-arm64/Teralexi.app
open build/mac-arm64/Teralexi.app
```

For distribution to other machines, use Developer ID + notarization (macOS) or Authenticode (Windows).

## Verify a signed app after build

Build output lands in `build/` (see `directories.output` in `build.json`). Replace paths/versions below with your actual artifacts.

### Automated: `npm run verify:signing`

`scripts/verify-signing.mjs` runs every check below against all `.app` / `.dmg` / `.exe` artifacts it finds and prints a pass/warn/fail summary.

```bash
npm run verify:signing                 # scan ./build
node scripts/verify-signing.mjs --dir build --strict   # non-zero exit on any warning
node scripts/verify-signing.mjs --json                 # machine-readable output
```

- macOS checks run only on macOS; Windows Authenticode checks run only where `powershell`/`signtool` exist (otherwise reported as `skip`).
- Default exit code is `0` unless a hard signature failure occurs; `--strict` also fails on warnings (unsigned / self-signed / unnotarized), which is useful in CI.

The manual commands below are what the script wraps, for when you want to inspect a single artifact in detail.

### macOS

**1. Verify the signature is valid and complete**

```bash
codesign --verify --deep --strict --verbose=2 "build/mac-arm64/Teralexi.app"
```

Expect `…: valid on disk` and `…: satisfies its Designated Requirement`. Any `code object is not signed at all` means an inner framework was missed.

**2. Inspect who signed it (Authority chain + Team ID)**

```bash
codesign -dv --verbose=4 "build/mac-arm64/Teralexi.app"
```

Look for:
- `Authority=Developer ID Application: Your Name (TEAMID)` → properly Developer ID signed.
- `Authority=Apple Development…` or a single `Signature=adhoc` → **not** distributable (dev/ad-hoc only).
- `TeamIdentifier=TEAMID` matches your `MAC_APPLE_TEAM_ID`.

**3. Gatekeeper assessment (what end users' Macs actually check)**

```bash
spctl --assess --type execute --verbose "build/mac-arm64/Teralexi.app"
```

Expect `source=Notarized Developer ID` and `accepted`. `source=Unnotarized Developer ID` means signed but not notarized; `rejected` means Gatekeeper will block it.

**4. Confirm the notarization ticket is stapled**

```bash
xcrun stapler validate "build/mac-arm64/Teralexi.app"
xcrun stapler validate "build/Teralexi-<version>-arm64.dmg"
```

Expect `The validate action worked!`. `does not have a ticket stapled` means notarization did not complete or the staple step was skipped.

**Staple failed with code 68 (CloudKit timeout)**

If the build fails with `Failed to staple your application with code: 68` and `api.apple-cloudkit.com` timed out, signing and notarization usually succeeded — only Apple's ticket delivery was slow. Retry:

```bash
node scripts/macos-staple-with-retry.cjs "build/mac/Teralexi.app"
# or for arch-specific output:
node scripts/macos-staple-with-retry.cjs "build/mac-arm64/Teralexi.app"
```

Then re-run packaging if dmg/zip were not produced, or staple the dmg directly after it is built. Check VPN/firewall if timeouts persist.

### Windows

Run these on Windows (PowerShell), against the NSIS installer and/or the unpacked `.exe`.

**PowerShell (no SDK required):**

```powershell
Get-AuthenticodeSignature "build\Teralexi Setup <version>.exe" | Format-List
```

Read the `Status` field:
- `Valid` → signed with a certificate trusted by this machine (real Authenticode cert).
- `UnknownError` / `NotTrusted` → signed, but the signing cert is **not trusted** — this is the expected result for the **self-signed fallback**. Check `SignerCertificate.Subject`; `CN=Teralexi (Self-Signed)` confirms it is the ephemeral self-signed cert, not a production cert.
- `NotSigned` → unsigned build (no cert configured and self-signed generation was skipped/failed).

**signtool (Windows SDK):**

```powershell
# /pa uses the Authenticode policy; /v is verbose
signtool verify /pa /v "build\Teralexi Setup <version>.exe"
```

A real cert prints `Successfully verified`. A self-signed cert fails chain-of-trust verification (`A certificate chain processed, but terminated in a root certificate which is not trusted`) — that is expected until a real Authenticode cert is supplied via `WIN_SIGN_CERTIFICATE`.

> Self-signed installers are signed but will still trigger a SmartScreen "unknown publisher" prompt. Use a real Authenticode certificate for distribution.

### Quick sanity check for CI artifacts

The build log already reports the chosen path via `scripts/run-electron-builder.ts`:

- `[code-sign] macOS signing configured` / `Apple notarization enabled`
- `[code-sign] Windows Authenticode signing configured (.pfx)`
- `[code-sign] Windows Azure Trusted Signing configured`
- `[code-sign] AZURE TRUSTED SIGNING: all required variables are present` (per-field OK list)
- `[code-sign] AZURE TRUSTED SIGNING: configuration incomplete` (per-field MISSING list — fix secrets before release)
- `[code-sign] Windows: … using generated self-signed certificate …`
- `[code-sign] … unsigned build …`

If the log shows the signed path but the checks above fail, the credentials were present but wrong (e.g. mismatched password or an untrusted/expired cert).

## Related

- [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md)
- [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md)
- [RELEASE.md](./RELEASE.md)
