---
title: Developer Guide
description: Ameow developer documentation — how to set up a development environment, find key entry points, and run basic validation.
---

Ameow's developer documentation is for contributors who want to develop or maintain the project. It explains **how to develop, debug, and verify** — it does not carry architecture authority.

## What's Covered

- [Local Development](./local-development/): dev server startup chain, preflight, development ports
- [Environment Variables](./environment-variables/): environment variables that affect development and diagnostics
- [Testing & Validation](./testing/): unit tests, lint, type checking
- [Docs Site & Locales](./docs-and-locales/): docs site development, locales synchronization

## Boundary Statement

Developer docs **only** explain how to develop, debug, and verify. They **do not** carry:

- **Architecture contracts and invariants**: owned by canonical files in the repo — [Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md) (runtime boundary contract) and [Electron Parity Verification](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-parity-verification.md) (migration verification). Developer docs link to these, not duplicate them.
- **Maintainer runbooks** (packaging, release, diagnostics, capability validation): see `docs/maintainer/` in the repository.
- **User guides**: see other sections of this site.
- **Development agent tooling** (Trellis / Codex / AI agent workflow): maintainer-internal tooling, not included in contributor-facing docs by default.

## Lab Lifecycle

The following tools' documentation status is based on the current `main` branch state:

| Tool | Status | Documentation Policy |
| --- | --- | --- |
| UI Lab | Still exists on main (DEV-only route `/ui-lab`), pending retirement | No long-term documentation |
| Browser Lab | Part of MR9 development line (Presentation Lab is a development-context alias), not yet on main | Not published as current stable; deferred until it enters the authoritative baseline |

UI Lab is still accessible via the DEV-only route in development, but building long-term workflows on it is not recommended. Browser Lab is a planned development-line capability (historically referenced as Presentation Lab in development context) — no callable entry point exists on current main.
