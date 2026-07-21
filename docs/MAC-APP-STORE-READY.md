# Mac App Store readiness (App Review Guidelines)

Checklist for submitting **Teralexi** to the **Mac App Store**, mapped to Apple’s [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Teralexi today ships via **Developer ID + notarization** (direct download from [teralexi.com](https://www.teralexi.com/)). MAS is a **separate** distribution path with additional hard requirements (sandbox, StoreKit, Sign in with Apple, no custom auto-update).

---

## Current compliance (direct download + App Review hygiene)

| Guideline | Requirement | Status |
| --- | --- | --- |
| **5.1.1(i)** Privacy policy | Link in App Store Connect **and** easily accessible in-app | **In-app:** Settings → About → Privacy Policy / Terms. **Web:** [privacy](https://www.teralexi.com/privacy.html) / [terms](https://www.teralexi.com/terms.html) on teralexi.com. |
| **5.1.1(v)** Account deletion | In-app deletion if account creation/sign-in is supported | **Not in the desktop app.** Deletion is out-of-band (support email / web). Revisit before MAS if Apple requires in-app deletion. |
| **1.5** Developer / support contact | Easy contact path | Settings → About → Help & Support / Email support (`info@teralexi.com`); [support page](https://www.teralexi.com/support.html). |

Before any App Store Connect submission, confirm these URLs resolve publicly and paste the privacy URL into App Privacy / Privacy Policy URL:

- `https://www.teralexi.com/privacy.html`
- `https://www.teralexi.com/terms.html`
- `https://www.teralexi.com/support.html`

---

## Product follow-ups

| Item | Notes |
| --- | --- |
| Account deletion | No delete-account UI in Settings. Users contact `info@teralexi.com` (or a future web flow on the platform API). MAS Guideline **5.1.1(v)** may require an in-app path. |
| Demo account for review | Guideline **2.1**: provide App Review a signed-in demo account (or demo mode) + live backends. |

---

## Hard MAS blockers (not done)

These will reject or make MAS packaging fail if ignored:

| Guideline / rule | Issue for Teralexi |
| --- | --- |
| **2.4.5(i)** App Sandbox | Electron agent needs broad filesystem, PTY, networking; needs a MAS sandbox entitlement profile and likely feature cuts or security-scoped bookmarks. |
| **2.4.5(vii)** Updates | Custom `electron-updater` / S3 feed is **not** allowed; MAS builds must update via the Mac App Store only. |
| **2.4.5(ii)** Packaging | Must submit via Xcode / Apple tooling; no third-party installers. `electron-builder` `mas` target is the usual path. |
| **3.1.1** In-App Purchase | Unlocking digital features/subscriptions inside the app requires StoreKit IAP (unless a documented exception applies and purchase CTAs are avoided). |
| **4.8** Login Services | Primary platform sign-in today is Google-backed → must also offer **Sign in with Apple** (or another option meeting 4.8) unless an exception applies. |
| **2.5.2** Download/execute code | Agents that download/run scripts face scrutiny; educate App Review in Notes; may need restrictions in MAS builds. |
| Hardened Runtime vs MAS certs | Current `scripts/entitlements.mac.plist` is for **Developer ID**. MAS needs App Sandbox entitlements + Mac App Store signing — see [CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md). |

---

## Before You Submit (Apple checklist)

- [ ] App is complete; backends live during review (**2.1**)
- [ ] Demo account credentials in Review Notes
- [ ] Explain non-obvious features: agents, tool approval, channels, local `~/.teralexi` data, LLM providers (**2.3.1**)
- [ ] Screenshots show the app in use (**2.3.3**)
- [ ] Age rating answers honest for AI chat + channel content (**2.3.6**)
- [ ] Privacy Nutrition Labels match Privacy Policy
- [ ] Support URL and Privacy URL set in App Store Connect
- [ ] Contact info current (**1.5**, **5.6.2**)
- [ ] Export compliance / encryption questionnaire completed

### Suggested App Review notes (draft)

```
Teralexi is a local-first AI agent desktop app.

Demo account: <email> / <password or Google test account steps>
Sign-in: Settings → Accounts → Sign in (browser → teralexi:// callback).

Privacy Policy: https://www.teralexi.com/privacy.html
Terms: https://www.teralexi.com/terms.html
Support: https://www.teralexi.com/support.html / info@teralexi.com

Account deletion: not offered in the desktop app; email info@teralexi.com.

Core data stays on-device under ~/.teralexi/. Optional support upload and website publish are user-initiated and entitlement-gated.
Agents may call LLM providers the user configures; tool runs require user approval in normal flows.
```

---

## Recommended next work order

1. Confirm how account deletion will be offered for MAS (**5.1.1(v)**).
2. Keep legal pages live on teralexi.com.
3. Add **Sign in with Apple** (4.8) alongside the current sign-in flow.
4. Decide monetization model for MAS (StoreKit subscriptions vs free companion).
5. Spike `electron-builder` `mas` target with App Sandbox; disable `electron-updater` for MAS builds.
6. Revisit UGC (channels) moderation if channels ship in the MAS binary.

This checklist documents App Review hygiene for the current **Developer ID** product. It does **not** by itself make the Electron binary Mac App Store–ready.
