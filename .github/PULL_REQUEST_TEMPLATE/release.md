## Release

- **Version:** `x.y.z` (must match `package.json`)
- **Bump type:** patch / minor / major
- **Target:** `main`

## Summary

<!-- 1–3 bullets: why this release ships now -->

-

## Changelog

- [ ] `CHANGELOG.md` has a `## [x.y.z] - YYYY-MM-DD` section (moved out of Unreleased)
- [ ] User-facing notes are clear (Added / Changed / Fixed / Removed)

## Checklist

- [ ] `package.json` / `package-lock.json` version bumped (`npm run version:patch|minor|major`)
- [ ] No secrets, signing material, or `.env` files in the diff
- [ ] CI green on this PR (unit + staging installer builds as applicable)
- [ ] Breaking changes called out (migration / reinstall notes if needed)

## Post-merge (maintainers)

- [ ] Merge to `main`
- [ ] Tag release: `git tag x.y.z && git push origin x.y.z` (or `vx.y.z` if that is repo convention)
- [ ] Run **Actions → Release → Run workflow** (`confirm: release`, platform as needed)
- [ ] Verify S3 / update feed for `{BASE_API}/desktop/releases/stable/`
- [ ] Spot-check macOS Gatekeeper / Windows install on a clean machine

## Test plan

- [ ]
- [ ]

## Links

- Docs: `docs/RELEASE.md`, `docs/DESKTOP-RELEASES.md`
- Related issues/PRs:
