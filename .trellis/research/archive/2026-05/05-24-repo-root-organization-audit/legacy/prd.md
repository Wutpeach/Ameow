# Audit repository root organization

## Goal

Audit the current `origin/main` repository root and propose a safe file/folder organization plan that makes the GitHub repository homepage cleaner without breaking build, release, documentation, localization, or agent workflow contracts.

The user accepted the low-risk cleanup plan from `audit.md`. This task now includes executing that first cleanup phase.

## User Value

- Repository homepage becomes easier to scan for humans.
- Important entry points remain visible.
- Generated, agent-only, documentation, assets, and build/config files are grouped more intentionally.
- Any future reorganization avoids broken links, workflow failures, or package/build config drift.

## Confirmed Facts

- Local `main` is synced with `origin/main` at the start of this audit.
- Root currently contains 39 visible entries:
  - hidden/tooling directories: `.agents`, `.codex`, `.github`, `.impeccable`, `.trellis`;
  - app/source directories: `browser-extension`, `desktop-assets`, `distribution`, `docs`, `electron`, `locales`, `public`, `release-notes`, `scripts`, `src`;
  - root docs: `AGENTS.md`, `DESIGN.md`, `LICENSE`, `PRODUCT.md`, `README.en.md`, `README.md`, `bugfix.md`;
  - root assets: `app-icon.png`, `app-icon.svg`, `background.png`;
  - build/config/package files: `electron-builder.config.mjs`, `eslint.config.js`, `index.html`, `package-lock.json`, `package.json`, `postcss.config.js`, `skills-lock.json`, `tailwind.config.js`, `tsconfig*.json`, `vite.config.ts`.
- Repository contains about 1906 tracked paths on `origin/main`.
- GitHub workflow files live under `.github/workflows/`.

## Requirements

- Produce an audit report of current root entries grouped by purpose.
- Identify which root files are expected conventionally and should probably remain at root.
- Identify which root files or directories could be moved safely only after reference updates.
- Identify high-risk moves where tooling convention, GitHub behavior, package managers, Vite, Electron Builder, release workflows, localization sync, or agent/Trellis behavior likely expects the current path.
- Search for references before recommending any move.
- Prefer minimal, staged cleanup over broad churn.
- Include a proposed target layout if cleanup is pursued.
- Include validation commands that would be required after any reorganization.
- Move `bugfix.md` to `docs/engineering/bugfix-log.md`.
- Move `app-icon.svg` to `desktop-assets/icons/source/app-icon.svg`.
- Add repository layout guidance to make the GitHub homepage easier to scan.
- Do not move `app-icon.png`, `background.png`, `desktop-assets/`, `distribution/`, `release-notes/`, package/tooling config files, `PRODUCT.md`, or `DESIGN.md` in this phase.

## Acceptance Criteria

- [x] Root entries are categorized by purpose and visibility.
- [x] Each candidate move includes rationale and likely required reference updates.
- [x] High-risk or "keep at root" entries are clearly listed.
- [x] Proposed cleanup avoids moving files that are conventional or path-sensitive unless benefits are strong.
- [x] Report includes a staged migration plan.
- [x] Report includes validation checklist.
- [x] No files are moved in this audit phase.
- [x] `bugfix.md` is moved under `docs/engineering/bugfix-log.md`.
- [x] `app-icon.svg` is moved under `desktop-assets/icons/source/app-icon.svg`.
- [x] Root README includes a concise repository layout section.
- [x] English README includes the same repository layout section.
- [x] No high-risk packaging or release paths are moved.
- [x] Reference scan does not show live non-archived references to the old moved paths.
- [x] Relevant validation commands pass.

## Audit Output

See `audit.md` in this task directory.

## Out Of Scope

- Renaming the product or package.
- Changing release behavior or tagging.
- Removing agent/Trellis metadata.
- Deleting files unless later proven obsolete and separately approved.
- Moving path-sensitive packaging assets or release-note locations.
