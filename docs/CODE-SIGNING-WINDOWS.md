# Windows code signing (Authenticode)

Teralexi uses [electron-builder](https://www.electron.build/code-signing) signing env vars at **build time only**. Signing config is **never baked into the app** and **never packaged** in the installer.

| Where | Used for |
| --- | --- |
| **`env/.signing.env`** (gitignored) | Local `npm run build:win64:*` / `release:win` — **both sit and prod** |
| **Shell exports** | Override `.signing.env` when needed |
| **GitHub Actions secrets** | CI and Release workflows (Windows job only) |

Do **not** commit `.pfx` files, passwords, or `env/.signing.env`.

Runtime user settings belong in `~/.teralexi/config/config.properties`.

## Two signing methods (pick one)

| Method | Best for | Credentials |
| --- | --- | --- |
| **`.pfx` file** | Traditional Authenticode cert on disk | `WIN_SIGN_CERTIFICATE` + password |
| **Azure Trusted Signing** | CI without storing `.pfx` | Seven `AZURE_*` env vars (Entra app + Artifact Signing account) |

When both Azure and `WIN_SIGN_*` are configured, **Azure takes precedence**.

## Local configuration (`env/.signing.env`)

```bash
cp env/.signing.env.example env/.signing.env
# Edit WIN_SIGN_* or AZURE_* values
```

Process environment variables override `.signing.env` (useful for one-off tests).

---

## Method 1: Authenticode `.pfx`

```properties
WIN_SIGN_CERTIFICATE = '~/certs/teralexi.pfx'
WIN_SIGN_CERTIFICATE_PASSWORD = 'your-pfx-password'
```

On Windows runners / local Windows builds, `WIN_SIGN_*` is mapped to `CSC_LINK` for electron-builder. When cross-building Windows from macOS, electron-builder uses `WIN_CSC_LINK` directly.

### Environment variable reference

| Alias | electron-builder |
| --- | --- |
| `WIN_SIGN_CERTIFICATE` | `WIN_CSC_LINK` (`.pfx`, or base64 in CI) |
| `WIN_SIGN_CERTIFICATE_PASSWORD` | `WIN_CSC_KEY_PASSWORD` |

You can also set `WIN_CSC_*` directly.

### GitHub Actions secrets (`.pfx`)

Store in the **`release`** environment (Release workflow) and **`mac_signs`** environment (CI build job).

| Secret | Maps to | Purpose |
| --- | --- | --- |
| `WIN_SIGN_CERTIFICATE_BASE64` | `WIN_SIGN_CERTIFICATE` | Base64 `.pfx` |
| `WIN_SIGN_CERTIFICATE_PASSWORD` | `WIN_SIGN_CERTIFICATE_PASSWORD` | `.pfx` password |

Encode Windows `.pfx` certificate:

```bash
# macOS / Linux
base64 -i teralexi.pfx | pbcopy

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('teralexi.pfx')) | Set-Clipboard
```

---

## Method 2: Azure Trusted Signing (remote, no `.pfx`)

Use [Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/) (formerly Trusted Signing) when you do not want to store a `.pfx` in CI. electron-builder 26+ signs via the `TrustedSigning` PowerShell module and Microsoft Entra app credentials.

**One-time Azure setup** (portal): register `Microsoft.CodeSigning`, create an Artifact Signing account + certificate profile, complete identity validation, create an App Registration with the **Artifact Signing Certificate Profile Signer** role, and create a client secret. See [Hendrik Erz's guide](https://hendrik-erz.de/post/code-signing-with-azure-trusted-signing-on-github-actions).

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

When all Azure variables are set, Teralexi passes `win.azureSignOptions` to electron-builder and skips the `.pfx` / self-signed paths.

### Required variables (all 7 must be present)

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

### Environment variable reference (Azure)

| Alias | electron-builder |
| --- | --- |
| `AZURE_TENANT_ID` | (electron-builder env credential) |
| `AZURE_CLIENT_ID` | (electron-builder env credential) |
| `AZURE_CLIENT_SECRET` | (electron-builder env credential) |
| `AZURE_SIGNING_ENDPOINT` | → `win.azureSignOptions.endpoint` |
| `AZURE_SIGNING_ACCOUNT_NAME` | → `win.azureSignOptions.codeSigningAccountName` |
| `AZURE_SIGNING_CERTIFICATE_PROFILE` | → `win.azureSignOptions.certificateProfileName` |
| `AZURE_SIGNING_PUBLISHER_NAME` | → `win.azureSignOptions.publisherName` |

### GitHub Actions secrets (Azure)

| Secret | Maps to | Purpose |
| --- | --- | --- |
| `AZURE_TENANT_ID` | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| `AZURE_CLIENT_ID` | `AZURE_CLIENT_ID` | App Registration **Application (client) ID** — not Object ID |
| `AZURE_CLIENT_SECRET` | `AZURE_CLIENT_SECRET` | App Registration client secret **Value** |
| `AZURE_SIGNING_ENDPOINT` | `AZURE_SIGNING_ENDPOINT` | Regional signing endpoint |
| `AZURE_SIGNING_ACCOUNT_NAME` | `AZURE_SIGNING_ACCOUNT_NAME` | Artifact Signing account name |
| `AZURE_SIGNING_CERTIFICATE_PROFILE` | `AZURE_SIGNING_CERTIFICATE_PROFILE` | Certificate profile name |
| `AZURE_SIGNING_PUBLISHER_NAME` | `AZURE_SIGNING_PUBLISHER_NAME` | Publisher CN from identity validation |

Store in **`release`** and **`mac_signs`** environments. The Windows matrix job receives secrets only when `matrix.platform == 'win'`.

### Common mistakes

| Mistake | Symptom |
| --- | --- |
| Using subscription ID instead of tenant ID | Auth fails in electron-builder / `Invoke-TrustedSigning` |
| Using App Registration **Object ID** instead of client ID | Auth fails |
| Copying secret **ID** instead of secret **Value** | Auth fails |
| Wrong endpoint region | Certificate profile not found |
| App Registration name instead of Artifact Signing account name | Signing account not found |
| Publisher name does not match identity validation CN | Signature rejected or publisher mismatch |
| Publisher name contains spaces (e.g. `Zhenqi Li`) | Must be quoted in electron-builder args — Teralexi handles this automatically; if you see `Unknown argument: li`, update to latest `run-electron-builder.ts` |

### Where to find the Endpoint (`AZURE_SIGNING_ENDPOINT`)

1. [Azure Portal](https://portal.azure.com) → search **Artifact Signing** (or *Trusted Signing*)
2. Open your **Artifact Signing account** (the resource you created, e.g. `teralexi`)
3. On **Overview**, find **Account URI** — that is your endpoint

Copy it exactly into `AZURE_SIGNING_ENDPOINT` / GitHub secret `AZURE_SIGNING_ENDPOINT`. A trailing slash is fine (`https://eus.codesigning.azure.net/`).

| Azure region (examples) | Endpoint URI |
| --- | --- |
| East US | `https://eus.codesigning.azure.net/` |
| West US 2 | `https://wus2.codesigning.azure.net/` |
| West Central US | `https://wcus.codesigning.azure.net/` |
| North Europe | `https://neu.codesigning.azure.net/` |
| West Europe | `https://weu.codesigning.azure.net/` |

The endpoint **must match** the region where the account and certificate profile were created. A wrong region often causes **403 Forbidden** during signing.

### Troubleshooting: `403 (Forbidden)` on `Submitting digest for signing...`

If the build log shows Trusted Signing reached `Submitting digest for signing...` then failed with:

```
Azure.RequestFailedException: Service request failed.
Status: 403 (Forbidden)
...
SignTool Error: An unexpected internal error has occurred.
```

**Authentication worked** (tenant/client/secret are valid), but Azure **rejected the sign request**. This is almost always IAM or resource metadata — not a Teralexi/electron-builder bug.

**Checklist (in order):**

1. **Role on the App Registration, not your user account**  
   GitHub Actions signs as the **App Registration service principal** (`AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`). That app must have the role — not only your personal Microsoft account.

   - Azure Portal → **Artifact Signing account** (the resource, not Entra ID)
   - **Access control (IAM)** → **Role assignments**
   - Confirm an assignment exists for role **Artifact Signing Certificate Profile Signer**
   - **Member** must be your **App Registration**

   If the role is only on your user account, local portal tests may work but CI will 403.

2. **Role scope = Artifact Signing account**  
   The Signer role must be assigned **on the Artifact Signing account resource**.

3. **Endpoint region matches the account**  
   Compare the `Endpoint` in the build log metadata with the region shown on the certificate profile in Azure Portal.

4. **Account and profile names are exact (case-sensitive)**  
   `CodeSigningAccountName` = Artifact Signing **account** resource name  
   `CertificateProfileName` = **Certificate profiles** tab → profile name

5. **Identity validation + profile status**  
   Identity validations → **Completed**; certificate profile → **Active**

6. **Client secret not expired**  
   Recreate secret and update `AZURE_CLIENT_SECRET` in GitHub if expired.

**Portal verification:**

```
Artifact Signing account
  → Access control (IAM)
  → Role assignments
  → Filter: "Artifact Signing Certificate Profile Signer"
  → Member column should show your App Registration name
```

**Still 403?** Confirm the App Registration service principal appears in the IAM role assignment on the signing account. Re-assign if needed, wait a few minutes, then re-run the workflow.

### Local debug (Azure)

```bash
# 1) Verify all AZURE_* vars + Entra token (+ optional ARM profile check)
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

It does **not** sign an `.exe` — TrustedSigning/signtool only runs on Windows. After `verify:azure-signing` passes on Mac, CI signing failures are usually IAM (403) or publisher-name mismatch.

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

---

## Local builds

```bash
cp env/.signing.env.example env/.signing.env   # once
npm run build:win64:sit   # signed sit build
npm run build:win64       # signed prod build
npm run release:win
```

All build scripts use `scripts/run-electron-builder.ts`, which loads `env/.signing.env` then process env before calling electron-builder. Unsigned builds still work when `.signing.env` is missing.

## Unsigned vs signed (Windows)

| | Unsigned (no keys) | Signed (keys provided) |
| --- | --- | --- |
| **Build** | `signAndEditExecutable` disabled → unsigned `.exe` / NSIS installer | `WIN_SIGN_*` → Authenticode, or Azure Trusted Signing → remote signing |
| **SmartScreen** | Unknown publisher | Trusted publisher (with real cert) |

Self-signed installers are signed but will still trigger a SmartScreen "unknown publisher" prompt. Use a real Authenticode certificate or Azure Trusted Signing for distribution.

## Verify a signed Windows installer

Run these on Windows (PowerShell), against the NSIS installer and/or the unpacked `.exe`.

### Automated

```bash
npm run verify:signing                 # scan ./build (Windows checks need powershell/signtool)
node scripts/verify-signing.mjs --dir build --strict
```

### PowerShell (no SDK required)

```powershell
Get-AuthenticodeSignature "build\Teralexi Setup <version>.exe" | Format-List
```

Read the `Status` field:
- `Valid` → signed with a certificate trusted by this machine (real Authenticode cert).
- `UnknownError` / `NotTrusted` → signed, but the signing cert is **not trusted** — expected for **self-signed fallback**. Check `SignerCertificate.Subject`; `CN=Teralexi (Self-Signed)` confirms ephemeral self-signed cert.
- `NotSigned` → unsigned build.

### signtool (Windows SDK)

```powershell
signtool verify /pa /v "build\Teralexi Setup <version>.exe"
```

A real cert prints `Successfully verified`. A self-signed cert fails chain-of-trust verification — expected until a real Authenticode cert is supplied.

## Build log messages

Look for these `[code-sign]` lines from `scripts/run-electron-builder.ts`:

- `[code-sign] Windows Authenticode signing configured (.pfx)`
- `[code-sign] Windows Azure Trusted Signing configured`
- `[code-sign] AZURE TRUSTED SIGNING: all required variables are present`
- `[code-sign] AZURE TRUSTED SIGNING: configuration incomplete`
- `[code-sign] Windows: … using generated self-signed certificate …`
- `[code-sign] … unsigned build …`

## Related

- [CODE-SIGNING.md](./CODE-SIGNING.md) — overview + macOS guide link
- [CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md) — macOS Developer ID + notarization
- [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md)
- [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md)
- [RELEASE.md](./RELEASE.md)
