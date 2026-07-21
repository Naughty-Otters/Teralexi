# Security Policy

## Supported versions

Security fixes are applied on the latest released version of Teralexi (see [GitHub Releases](https://github.com/Naughty-Otters/Teralexi/releases)). Please upgrade before reporting issues that may already be fixed.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **info@teralexi.com** with:

- A description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- Affected version / commit if known
- Your preferred contact for follow-up

We aim to acknowledge reports within a few business days. Once validated, we will work on a fix and coordinate disclosure timing with you.

## Scope notes

- This repository is the **desktop client**. Optional cloud features talk to a separate platform API (`BASE_API`). Issues that only affect a self-hosted or third-party backend should be reported to that backend’s maintainers.
- Do not include production signing certificates, OAuth client secrets, or other credentials in reports or PRs.
