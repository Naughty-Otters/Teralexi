# Build & Release Guide

This document explains how Teralexi selects environment configuration, how to build locally, and how CI vs production releases work on GitHub Actions.

## Environment files

Teralexi uses three build environments. Each maps to a file under `env/`:

| Mode | File | `TERALEXI_BUILD_ENV` | `NODE_ENV` | Purpose |
| --- | --- | --- | --- | --- |
| **Development** | `env/.dev.env` | `dev` | `development` | Local `npm run dev` |
| **Staging (SIT)** | `env/.sit.env` | `sit` | `sit` | CI builds, internal QA |
| **Production** | `env/.prod.env` | `prod` | `production` | Public releases |

**SIT** = System Integration Test (staging). Use it for pre-production builds that should not point at production APIs yet.

### What each file controls

Configure the Teralexi platform backend once with `BASE_API`. At runtime it maps to `app.base.apiUrl`. Default endpoints are relative paths under that base:

| Endpoint | Default path |
| --- | --- |
| GraphQL metrics | `graphql` |
| Google sign-in | `auth/login` |
| Support upload | `support/upload` |

- **Build-time (main + renderer):** `BASE_API` is baked into both bundles from `env/.{mode}.env`. Packaged apps do not read env files at runtime — rebuild to change API targets.
- **Runtime (main process):** optional overrides such as `app.metrics.graphqlUrl` may be relative paths or legacy absolute URLs (via `config.properties` only).

**Code signing:** builds are **unsigned by default** (macOS and Windows). Copy `env/.signing.env.example` → `env/.signing.env` for local signed builds (sit and prod). CI/Release uses GitHub Actions secrets — see [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md) (overview), [CODE-SIGNING-APPLE.md](./docs/CODE-SIGNING-APPLE.md), [CODE-SIGNING-WINDOWS.md](./docs/CODE-SIGNING-WINDOWS.md).

Example `env/.dev.env`:

```properties
BASE_API = 'http://127.0.0.1:8000'
NODE_ENV = 'development'
```

### Editing env files

```text
env/
  .dev.env              # local development
  .sit.env              # staging / CI app config
  .prod.env             # production app config
  .signing.env.example  # template (committed)
  .signing.env          # local signing secrets (gitignored, build-time only)
```

Update URLs and secrets in the matching file before building for that environment. Do not commit real production secrets unless your team policy allows it.

---

## Local development

```bash
npm install
npm run dev          # uses env/.dev.env (-m dev)
```

`npm run dev` sets `TERALEXI_BUILD_ENV=dev` and loads `env/.dev.env` for both the build tooling and the running app.

---

## Local builds

All desktop builds run through `.electron-vite/build.ts` with a `-m` flag, then `electron-builder`.

### Production (default)

```bash
npm run build              # current platform, no publish
npm run build:mac          # macOS dmg + zip
npm run build:win64        # Windows x64 installer
npm run build:linux        # Linux AppImage
npm run build:dir          # unpacked output for inspection
```

### Staging (SIT)

```bash
npm run build:sit
npm run build:mac:sit
npm run build:win64:sit
npm run build:linux:sit
npm run build:dir:sit
```

### Renderer-only build (CI validation)

```bash
npm run build:web
```

### Environment flag reference

You can also pass the mode explicitly:

```bash
tsx .electron-vite/build.ts -m dev
tsx .electron-vite/build.ts -m sit
tsx .electron-vite/build.ts -m prod
```

Or set `TERALEXI_BUILD_ENV` (`dev` | `sit` | `prod`) before running a build script.

---

## GitHub Actions

### CI — staging (`env/.sit.env`)

**Workflow:** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

**Triggers:**

| Event | What runs |
| --- | --- |
| **Pull request** | Unit tests + signed macOS/Windows **sit** builds → GitHub artifacts |
| **Push** to any branch | Same as PR |
| **Push** to `main` | Same as PR + README CI status update |
| **Manual** | Actions → **CI** → Run workflow (full staging pipeline) |

**Build env:** `TERALEXI_BUILD_ENV=sit` → loads `env/.sit.env` (staging `BASE_API` only — same update feed path as prod).

**Scripts:** `build:mac:sit`, `build:win64:sit`

**Signing:** macOS and Windows jobs each receive platform-specific secrets. See [CODE-SIGNING-APPLE.md](./docs/CODE-SIGNING-APPLE.md) and [CODE-SIGNING-WINDOWS.md](./docs/CODE-SIGNING-WINDOWS.md).

**Outputs:**

- Artifacts: `teralexi-<platform>-sit-<run>-<sha>` (14-day retention)

### Release — production (`env/.prod.env`)

**Workflow:** [`.github/workflows/release.yml`](./.github/workflows/release.yml)

**Trigger:** Actions → **Release** → Run workflow → confirm `release`

**Build env:** `TERALEXI_BUILD_ENV=prod` → loads `env/.prod.env`

**Scripts:** `release:mac`, `release:win`

**Signing:** Same `MAC_SIGN_*` / `WIN_SIGN_*` secrets as CI (platform-specific per runner).

**Output:** Upload to `s3://…/desktop/releases/stable/` (production update feed)

**Publishing auth:** The S3 upload uses **GitHub OIDC** to assume an AWS IAM role — no long-lived access keys. See [AWS OIDC setup](#aws-oidc-setup-for-s3-publishing) below.

---

## AWS OIDC setup for S3 publishing

The Release workflow authenticates to AWS with short-lived credentials via GitHub's OIDC provider (`aws-actions/configure-aws-credentials`), so there are no static AWS keys stored in GitHub. This is a **one-time setup per AWS account**.

### Required GitHub secrets (environment: `release`)

| Secret | Example | Purpose |
| --- | --- | --- |
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::123456789012:role/teralexi-release` | Role the workflow assumes via OIDC |
| `AWS_REGION` | `us-east-1` | Region of the release bucket (no trailing spaces/newlines) |
| `S3_RELEASE_BUCKET` | `your-release-bucket` | Target bucket for installers |

### 1. Register the GitHub OIDC identity provider in IAM

Check **IAM → Identity providers** first. If there is no provider for `token.actions.githubusercontent.com`, create it:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

- **Provider URL:** `https://token.actions.githubusercontent.com`
- **Audience (client ID):** `sts.amazonaws.com`

If the provider already exists but is missing the audience, add it:

```bash
aws iam add-client-id-to-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com \
  --client-id sts.amazonaws.com
```

> Skipping this step (or a missing/incorrect audience) causes:
> `Could not assume role with OIDC: The web identity token provided could not be validated.`

### 2. Create the IAM role with a trust policy

Create a role (name it e.g. `teralexi-release`) whose **trust policy** allows the GitHub OIDC provider to assume it. Replace `<ACCOUNT_ID>` with your 12-digit AWS account ID.

**Important:** GitHub may put **owner/repo numeric IDs** into the OIDC `sub` claim (especially after org settings that uniquify subjects). Do **not** guess — run the Release workflow’s **Debug OIDC claims** step and copy `oidcClaims.sub` exactly. For this repo it looks like:

`repo:Naughty-Otters@295407917/Teralexi@1275396040:environment:release`

(not `repo:Naughty-Otters/Teralexi:…`).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": [
        "sts:AssumeRoleWithWebIdentity",
        "sts:TagSession"
      ],
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:Naughty-Otters@295407917/Teralexi@1275396040:*"
        }
      }
    }
  ]
}
```

`sts:TagSession` is required when `aws-actions/configure-aws-credentials@v5` sends session tags (its default). The Release workflow also sets `role-skip-session-tagging: true` so assumption still works if the trust policy only has `sts:AssumeRoleWithWebIdentity`.

Because the release job uses `environment: release`, the exact `sub` is `repo:Naughty-Otters@295407917/Teralexi@1275396040:environment:release`. The `…:*` wildcard above covers it; you can tighten `StringLike` / use `StringEquals` on that exact value if you prefer.

### 3. Attach an S3 write permission policy to the role

Grant the role permission to upload to the release bucket/prefix:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<S3_RELEASE_BUCKET>",
        "arn:aws:s3:::<S3_RELEASE_BUCKET>/desktop/releases/stable/*"
      ]
    }
  ]
}
```

### 4. Verify

Set `AWS_ROLE_TO_ASSUME`, `AWS_REGION`, and `S3_RELEASE_BUCKET` in the `release` environment, then run the Release workflow. The **Configure AWS credentials (OIDC)** step should log `Assuming role with OIDC` and succeed.

Troubleshooting:

- `getaddrinfo ENOTFOUND sts.<region>.amazonaws.com` → `AWS_REGION` is invalid or has trailing whitespace/newline.
- `The web identity token provided could not be validated` → OIDC provider not registered, or its audience isn't `sts.amazonaws.com` (step 1).
- `Not authorized to perform sts:AssumeRoleWithWebIdentity` → trust policy `sub` does not match the JWT (copy `oidcClaims.sub` from the Debug step — it may include `@ownerId` / `@repoId`), **or** missing `sts:TagSession` while the action sends session tags, **or** you edited a different role than `AWS_ROLE_TO_ASSUME`.

---

## Creating a production release

### 1. Bump version and changelog

```bash
npm run version:patch   # or version:minor / version:major
# Edit CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.0.2"
git push origin main
```

Optional: tag the commit (`git tag v0.0.2 && git push origin v0.0.2`) if you want the ref name to match the version.

### 2. Run the Release workflow

1. Open **Actions → Release → Run workflow**
2. Select the branch or tag to build from
3. Enter `release` in the confirm input

The workflow uses **`env/.prod.env`**, builds macOS and Windows installers, and uploads to S3.

If the workflow runs on a **version tag** (`v0.0.2`), the workflow verifies the tag matches `package.json`. When run manually from a branch, it publishes using the current `package.json` version.

### 3. Local build + S3 upload (optional)

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export S3_RELEASE_BUCKET=your-bucket
export TERALEXI_BUILD_ENV=prod

npm run release:mac   # on macOS
npm run release:upload-s3
```

These scripts use `-m prod` and `env/.prod.env`. See [`docs/DESKTOP-RELEASES.md`](./docs/DESKTOP-RELEASES.md).

---

## Auto-update

Packaged apps check `{BASE_API}/desktop/releases/stable/` via `electron-updater` (generic provider). CI uploads installers to private S3; the update feed is served publicly (no sign-in).

**macOS in-app install** requires signed + notarized release builds. See [CODE-SIGNING-APPLE.md](./docs/CODE-SIGNING-APPLE.md).

See [`docs/DESKTOP-RELEASES.md`](./docs/DESKTOP-RELEASES.md) and [`docs/RELEASE.md`](./docs/RELEASE.md).

---

## Quick reference

| Goal | Command / workflow |
| --- | --- |
| Run locally | `npm run dev` → `.dev.env` |
| PR / branch validation | **CI** workflow → `.sit.env`, signed sit artifacts |
| Staging update feed | Same path as prod on staging API: `{BASE_API}/desktop/releases/stable/` (publish separately) |
| Public production release | **Release** workflow → `.prod.env` → S3 `desktop/releases/stable/` |
| Change API URLs | Edit the matching file in `env/` |
