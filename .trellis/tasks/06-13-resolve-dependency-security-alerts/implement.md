# Implementation Plan

## Phase 1: Low-Risk Root Fixes

- [x] Confirm current root alerts:
  - `npm audit --json`
  - `gh api repos/Wutpeach/Ameow/dependabot/alerts --paginate`
- [x] Save a baseline alert snapshot in the task notes or final report, grouped by advisory ID.
- [x] Update root dependency ranges conservatively:
  - `ws` to `8.21.0` or newer 8.x.
  - `react-router-dom` to `7.17.0`.
  - `postcss` to `8.5.15`.
  - `electron-builder` to `26.15.3` or newer 26.x.
- [x] Refresh root lockfile with explicit package updates; do not run unchecked `npm audit fix`.
- [x] Review `package-lock.json` diff and reject unrelated Vite/Astro major movement in Phase 1.
- [x] Confirm transitive patched versions in `package-lock.json`:
  - `@xmldom/xmldom >= 0.8.13`
  - `tmp >= 0.2.6`
  - `ip-address > 10.1.0`
  - vulnerable `brace-expansion` 5.x instances are `>= 5.0.6`
- [x] If `electron-builder@26.x` does not resolve all targeted transitive alerts, evaluate narrow `overrides` for the remaining transitive packages.
- [x] Run root audit and categorize any remaining root alerts.
- [x] Run clean install verification:
  - `npm ci`
- [x] Run root verification:
  - `npm run type-check`
  - `npm run lint`
  - `npm run test`
  - confirm Vitest discovered test files despite `--passWithNoTests`
  - `npm run build`
  - `npm run package:dir`
- [x] Report Phase 1 alert delta by advisory ID.

## Phase 2: Esbuild / Vite / Astro Review

- [x] Re-check remaining root and docs-site alerts:
  - `npm audit --json`
  - `npm --prefix site audit --json`
  - GitHub Dependabot open alerts.
- [x] Try safe patch/minor updates first:
  - root Vite 7.x if still applicable.
  - `site/astro` within 6.x.
  - `site/@astrojs/starlight` within 0.x.
- [x] If `esbuild` alerts remain, evaluate an `overrides` strategy and validate:
  - `npx esbuild --version`
  - `npm run build:renderer`
  - root `npm run build`
  - root `npm run test`
  - `npm run docs:build`
- [x] If overrides are incompatible, evaluate major upgrades separately:
  - root `vite@8` plus compatible `@vitejs/plugin-react`.
  - docs-site compatible Astro/Starlight upgrade path.
- [x] If deferring any remaining low-severity `esbuild` alert, document:
  - affected manifest.
  - exposed workflow.
  - why it is acceptable to defer.
  - trigger for revisiting.

## Review Gates

- [x] Phase 1 and Phase 2 changes are separated in git diff or separate commits.
- [x] No unrelated package modernization is included.
- [x] No app version bump is performed.
- [x] Public docs are unchanged unless dependency behavior or docs-site build instructions change.
- [x] Final report lists alerts fixed, alerts remaining, commands run, and any residual risk.

## Implementation Results

- Phase 1 closed root alerts for `ws`, `react-router`, `postcss`, `@xmldom/xmldom`, `tmp`, `ip-address`, and `brace-expansion`.
- Phase 2 upgraded root Vite to 8 and `@vitejs/plugin-react` to 6, clearing root `esbuild`/Vite audit findings.
- Phase 2 upgraded docs-site Astro/Starlight patch lines and added a docs-site-only `esbuild@0.28.1` override, clearing docs-site audit findings.
- Final root audit: 0 vulnerabilities.
- Final docs-site audit: 0 vulnerabilities.
- Vitest discovered 128 test files and ran 869 tests.
- `npm ci` in the live worktree was blocked by running Electron/esbuild processes holding native files open on Windows; the same root and docs-site lockfiles passed `npm ci` in a clean temporary git worktree.
