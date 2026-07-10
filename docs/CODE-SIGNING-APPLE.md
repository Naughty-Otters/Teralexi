# macOS code signing (Developer ID + notarization)

Teralexi uses [electron-builder](https://www.electron.build/code-signing) signing env vars at **build time only**. Signing config is **never baked into the app** and **never packaged** in the installer.

| Where | Used for |
| --- | --- |
| **`env/.signing.env`** (gitignored) | Local `npm run build:mac:*` / `release:mac` — **both sit and prod** |
| **Shell exports** | Override `.signing.env` when needed |
| **GitHub Actions secrets** | CI and Release workflows (macOS job only) |

Do **not** commit `.p12` files, passwords, or `env/.signing.env`.

Runtime user settings belong in `~/.teralexi/config/config.properties`.

## Why macOS signing matters

**In-app auto-update install** requires a **Developer ID–signed + notarized** build. Unsigned or ad-hoc builds may fail with ShipIt / Gatekeeper errors on end-user machines.

## Local configuration (`env/.signing.env`)

```bash
cp env/.signing.env.example env/.signing.env
# Edit MAC_SIGN_* / MAC_APPLE_* values
```

Example:

```properties
MAC_SIGN_IDENTITY = 'Your Name (TEAMID)'
MAC_APPLE_ID = 'you@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'xxxx-xxxx-xxxx-xxxx'
MAC_APPLE_TEAM_ID = 'TEAMID'
```

Process environment variables override `.signing.env` (useful for one-off tests).

## Where to get each value (Apple Developer)

You need an active **[Apple Developer Program](https://developer.apple.com/programs)** membership ($99/year). Individual and organization accounts both work; organization accounts use the org's Team ID.

### Prerequisites — create the signing certificate (one-time)

This produces the **Developer ID Application** certificate used for `MAC_SIGN_IDENTITY` and `MAC_SIGN_CERTIFICATE`.

1. Sign in at [developer.apple.com/account](https://developer.apple.com/account).
2. Open **Certificates, Identifiers & Profiles** → **Certificates** → **+** (create).
3. Under **Software**, choose **Developer ID Application** → Continue.
4. On a Mac, open **Keychain Access** → menu **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**.
   - Enter your email, leave CA Email blank, select **Saved to disk**, save the `.certSigningRequest` file.
5. Back in the Developer portal, upload the `.certSigningRequest` → Continue → Download the `.cer` file.
6. Double-click the downloaded `.cer` to install it in **login** keychain. You should now see:
   `Developer ID Application: Your Name (TEAMID)` in Keychain Access → **My Certificates**.

> **Do not** use an **Apple Development**, **Mac Development**, or **Mac App Distribution** certificate for Teralexi builds — those are for local/Xcode dev or **Mac App Store** submission. You need **Developer ID Application** (direct download + notarization).

### Mac App Distribution vs Developer ID Application

Apple offers **two different Mac distribution paths**. They use **different certificates** and are **not interchangeable**.

| Certificate | Used for | Teralexi? |
| --- | --- | --- |
| **Developer ID Application** | Apps distributed **outside** the Mac App Store (your website, S3, electron-updater) | **Yes** — this is what `MAC_SIGN_*` expects |
| **Mac App Distribution** | Apps submitted to the **Mac App Store** via App Store Connect / Xcode | **No** — only if you ship through the App Store |

**Why Teralexi uses Developer ID, not Mac App Distribution:**

- Teralexi ships `.dmg` / `.zip` installers and auto-updates from your own release feed (`BASE_API` / S3), not from the Mac App Store.
- Gatekeeper on end-user Macs expects a **Developer ID** signature + **notarization** for that model.
- **Mac App Distribution** certs sign builds for Apple's review pipeline; they do not replace Developer ID for direct downloads.

**Related certs you may also see (also not for Teralexi's current flow):**

| Certificate | Purpose |
| --- | --- |
| **Developer ID Installer** | Sign `.pkg` installers for **outside** the App Store (Teralexi uses `.dmg`/NSIS-style packaging, not `.pkg`) |
| **Mac Installer Distribution** | `.pkg` for **Mac App Store** submission |
| **Apple Development** / **Mac Development** | Local debugging in Xcode only |

If you only have **Mac App Distribution** in your account, create a separate **Developer ID Application** certificate (steps above). You can hold both on the same team — they serve different release channels.

---

### `MAC_SIGN_IDENTITY`

**What it is:** The human-readable name of your **Developer ID Application** certificate in Keychain.

**Where to get it:**

1. Open **Keychain Access** on your Mac → **My Certificates**.
2. Find the row that starts with **Developer ID Application:**.
3. Copy the name in parentheses at the end — e.g. `Your Name (ABC123XYZ0)`.

Or from Terminal:

```bash
security find-identity -v -p codesigning
```

Look for a line like:

```
1) ABCD1234… "Developer ID Application: Your Name (ABC123XYZ0)"
```

Use `Your Name (ABC123XYZ0)` — **without** the `Developer ID Application:` prefix (Teralexi/electron-builder add that automatically). Pasting the full Keychain string also works.

**GitHub secret:** same string as `MAC_SIGN_IDENTITY`.

---

### `MAC_SIGN_CERTIFICATE` (+ `MAC_SIGN_CERTIFICATE_BASE64` in CI)

**What it is:** A `.p12` (PKCS#12) file containing your **Developer ID Application** private key + certificate. Required for CI runners that do not have your Mac Keychain.

**Where to get it:**

1. In **Keychain Access** → **My Certificates**, expand **Developer ID Application: …**.
2. Select **both** the certificate **and** its private key (the key must be included or export fails).
3. Right-click → **Export 2 items…** → format **Personal Information Exchange (.p12)**.
4. Set an export password — this becomes `MAC_SIGN_CERTIFICATE_PASSWORD`.
5. Save as e.g. `teralexi.p12` and point `MAC_SIGN_CERTIFICATE` at the path.

**For GitHub Actions:** base64-encode the file (do not commit the `.p12`):

```bash
base64 -i teralexi.p12 | pbcopy   # paste into MAC_SIGN_CERTIFICATE_BASE64 secret
```

**Local only?** If the cert is already in your Keychain, you can omit `MAC_SIGN_CERTIFICATE` and set only `MAC_SIGN_IDENTITY` (Option A below).

---

### `MAC_SIGN_CERTIFICATE_PASSWORD`

**What it is:** The password you chose when exporting the `.p12` in Keychain Access.

**Where to get it:** You create this yourself during export (step 4 above). Apple does not store or recover it — if lost, export a new `.p12` from Keychain (or revoke and re-create the certificate in the Developer portal).

**GitHub secret:** `MAC_SIGN_CERTIFICATE_PASSWORD` (same value).

---

### `MAC_APPLE_ID`

**What it is:** The Apple ID email used for **notarization** (submitting the signed app to Apple). Usually the same Apple ID tied to your Developer Program membership.

**Where to get it:**

1. Sign in at [appleid.apple.com](https://appleid.apple.com) — the email shown is your Apple ID.
2. Or [developer.apple.com/account](https://developer.apple.com/account) → top-right account menu → the signed-in email.

**GitHub secret:** `MAC_APPLE_ID` (some workflows also accept legacy name `APPLE_ID`).

> This is your normal Apple ID **email**, not an app-specific password.

---

### `MAC_APPLE_APP_SPECIFIC_PASSWORD`

**What it is:** A one-time-generated password Apple requires for automated notarization (instead of your regular Apple ID password).

**Where to get it:**

1. Sign in at [appleid.apple.com](https://appleid.apple.com).
2. **Sign-In and Security** → **App-Specific Passwords** → **+** (or **Generate an app-specific password**).
3. Label it e.g. `Teralexi notarization` → copy the password (format `xxxx-xxxx-xxxx-xxxx`).

**Important:**

- This is **not** your Apple ID login password.
- Apple shows each app-specific password **only once** at creation — store it in `env/.signing.env` or GitHub secrets immediately.
- If lost, revoke the old one on appleid.apple.com and generate a new one.

**GitHub secret:** `MAC_APPLE_APP_SPECIFIC_PASSWORD` (legacy alias: `APPLE_APP_SPECIFIC_PASSWORD`).

---

### `MAC_APPLE_TEAM_ID`

**What it is:** Your 10-character Apple Developer **Team ID** — ties signing and notarization to the correct team.

**Where to get it:**

1. [developer.apple.com/account](https://developer.apple.com/account) → **Membership details** → **Team ID** (e.g. `ABC123XYZ0`).
2. Or from your certificate name in Keychain: `Developer ID Application: Your Name (**ABC123XYZ0**)` — the part in parentheses.
3. Or run `security find-identity -v -p codesigning` and read the Team ID from the identity string.

**GitHub secret:** `MAC_APPLE_TEAM_ID` (legacy alias: `APPLE_TEAM_ID`).

---

### Quick reference — variable → source

| Variable | Where on Apple / your Mac | Example |
| --- | --- | --- |
| `MAC_SIGN_IDENTITY` | Keychain **My Certificates** → Developer ID Application name | `Jane Doe (ABC123XYZ0)` |
| `MAC_SIGN_CERTIFICATE` | Export `.p12` from Keychain (cert + private key) | `~/certs/teralexi.p12` |
| `MAC_SIGN_CERTIFICATE_PASSWORD` | Password you set during `.p12` export | (your choice) |
| `MAC_APPLE_ID` | [appleid.apple.com](https://appleid.apple.com) → account email | `you@example.com` |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords | `abcd-efgh-ijkl-mnop` |
| `MAC_APPLE_TEAM_ID` | [developer.apple.com/account](https://developer.apple.com/account) → Membership → Team ID | `ABC123XYZ0` |

**Signing vs notarization:** `MAC_SIGN_*` signs the app with your Developer ID certificate. The three `MAC_APPLE_*` vars let the build **notarize** with Apple. Production macOS distribution needs **both**; signing alone is not enough for Gatekeeper on other Macs.

### Option A — Keychain identity (recommended locally)

```properties
MAC_SIGN_IDENTITY = 'Your Name (TEAMID)'
```

Use the name from Keychain **without** the `Developer ID Application:` prefix — electron-builder adds that automatically. You can also paste the full Keychain string; Teralexi strips the prefix for you.

List identities: `security find-identity -v -p codesigning`

### Option B — `.p12` file (CI or when cert is not in Keychain)

```properties
MAC_SIGN_CERTIFICATE = '~/certs/teralexi.p12'
MAC_SIGN_CERTIFICATE_PASSWORD = 'your-p12-password'
MAC_SIGN_IDENTITY = 'Your Name (TEAMID)'
```

### Notarization (production releases)

```properties
MAC_APPLE_ID = 'you@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'xxxx-xxxx-xxxx-xxxx'
MAC_APPLE_TEAM_ID = 'TEAMID'
```

When all three Apple vars are set, builds notarize in the `afterSign` hook (with extended staple retries) and pass `--config.mac.notarize=false` so electron-builder does not staple with its shorter 3-attempt timeout.

## Environment variable reference

| Alias | electron-builder | How to get |
| --- | --- | --- |
| `MAC_SIGN_CERTIFICATE` | `CSC_LINK` (macOS `.p12`) | [Export from Keychain](#mac_sign_certificate--mac_sign_certificate_base64-in-ci) |
| `MAC_SIGN_CERTIFICATE_PASSWORD` | `CSC_KEY_PASSWORD` | [Set during `.p12` export](#mac_sign_certificate_password) |
| `MAC_SIGN_IDENTITY` | `CSC_NAME` | [Keychain identity name](#mac_sign_identity) |
| `MAC_APPLE_ID` | `APPLE_ID` | [Apple ID email](#mac_apple_id) |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_APP_SPECIFIC_PASSWORD` | [App-specific password](#mac_apple_app_specific_password) |
| `MAC_APPLE_TEAM_ID` | `APPLE_TEAM_ID` | [Team ID on membership page](#mac_apple_team_id) | Notarization |

You can also set `CSC_*` and `APPLE_*` directly. See [Where to get each value](#where-to-get-each-value-apple-developer) above for Apple Developer portal steps.

## Local builds

```bash
cp env/.signing.env.example env/.signing.env   # once
npm run build:mac:sit   # signed sit build (uses .sit.env + .signing.env)
npm run build:mac       # signed prod build (uses .prod.env + .signing.env)
npm run release:mac
```

All build scripts use `scripts/run-electron-builder.ts`, which loads `env/.signing.env` then process env before calling electron-builder. App config (`BASE_API`, etc.) still comes from `env/.{dev|sit|prod}.env`. Unsigned builds still work when `.signing.env` is missing.

## GitHub Actions secrets

Used by **Release** (macOS job) and **CI** (macOS job). Store in the **`release`** environment (Settings → Environments → release).

| Secret | Maps to | Purpose |
| --- | --- | --- |
| `MAC_SIGN_CERTIFICATE_BASE64` | `MAC_SIGN_CERTIFICATE` | Base64 `.p12` — [how to export](#mac_sign_certificate--mac_sign_certificate_base64-in-ci) |
| `MAC_SIGN_CERTIFICATE_PASSWORD` | `MAC_SIGN_CERTIFICATE_PASSWORD` | `.p12` export password — [how to get](#mac_sign_certificate_password) |
| `MAC_SIGN_IDENTITY` | `MAC_SIGN_IDENTITY` | Developer ID identity — [how to get](#mac_sign_identity) |
| `MAC_APPLE_ID` | `MAC_APPLE_ID` | Notarization Apple ID — [how to get](#mac_apple_id) |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | `MAC_APPLE_APP_SPECIFIC_PASSWORD` | Notarization — [how to get](#mac_apple_app_specific_password) |
| `MAC_APPLE_TEAM_ID` | `MAC_APPLE_TEAM_ID` | Team ID — [how to get](#mac_apple_team_id) |

Encode macOS certificate (after [exporting `.p12`](#mac_sign_certificate--mac_sign_certificate_base64-in-ci)):

```bash
base64 -i teralexi.p12 | pbcopy
```

## Unsigned vs signed (macOS)

| | Unsigned (no keys) | Signed (keys provided) |
| --- | --- | --- |
| **Runtime** | `hardenedRuntime` disabled; app is ad-hoc re-signed in `afterSign` (before dmg/zip) and again post-build | `MAC_SIGN_IDENTITY` / `MAC_SIGN_CERTIFICATE` → Developer ID signing; `hardenedRuntime` stays enabled |
| **Distribution** | Local dev only | Required for auto-update and Gatekeeper on other Macs |

Auto-discovery of keychain certificates is **disabled** for unsigned macOS builds so electron-builder does not partially sign with a stray cert.

**Unsigned manual fix** (only needed for artifacts built before this policy):

```bash
codesign --force --deep --sign - build/mac-arm64/Teralexi.app
xattr -cr build/mac-arm64/Teralexi.app
open build/mac-arm64/Teralexi.app
```

## Verify a signed macOS app

Build output lands in `build/` (see `directories.output` in `build.json`). Replace paths/versions below with your actual artifacts.

### Automated

```bash
npm run verify:signing                 # scan ./build (macOS checks run on macOS only)
node scripts/verify-signing.mjs --dir build --strict
```

### Manual checks

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

### Staple failed with code 68 (CloudKit timeout)

If the build fails with `Failed to staple your application with code: 68` and `api.apple-cloudkit.com` timed out, signing and notarization usually succeeded — only Apple's ticket delivery was slow. Retry:

```bash
node scripts/macos-staple-with-retry.cjs "build/mac/Teralexi.app"
# or for arch-specific output:
node scripts/macos-staple-with-retry.cjs "build/mac-arm64/Teralexi.app"
```

Then re-run packaging if dmg/zip were not produced, or staple the dmg directly after it is built. Check VPN/firewall if timeouts persist.

## Build log messages

Look for these `[code-sign]` lines from `scripts/run-electron-builder.ts`:

- `[code-sign] macOS signing configured`
- `[code-sign] Apple notarization enabled`
- `[code-sign] … unsigned build …`

If the log shows the signed path but verification fails, credentials were present but wrong (e.g. mismatched password or an untrusted/expired cert).

## Related

- [CODE-SIGNING.md](./CODE-SIGNING.md) — overview + Windows guide link
- [CODE-SIGNING-WINDOWS.md](./CODE-SIGNING-WINDOWS.md) — Windows Authenticode / Azure Trusted Signing
- [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md)
- [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md)
- [RELEASE.md](./RELEASE.md)
