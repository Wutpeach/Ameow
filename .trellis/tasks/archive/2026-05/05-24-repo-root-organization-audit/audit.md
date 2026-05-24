# Repository Root Organization Audit

## Scope

Audited `origin/main` root organization for homepage cleanliness. This is a planning-only audit; no repository files were moved.

## Current Root Shape

The root currently has 39 visible entries:

- Agent/tooling: `.agents`, `.codex`, `.github`, `.impeccable`, `.trellis`
- Product/source: `src`, `electron`, `browser-extension`, `locales`, `public`
- Packaging/runtime: `desktop-assets`, `distribution`, `release-notes`, `scripts`
- Public docs: `README.md`, `README.en.md`, `docs`, `LICENSE`
- Agent/design docs: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`
- Root assets: `app-icon.png`, `app-icon.svg`, `background.png`
- Config/build: `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `electron-builder.config.mjs`, `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `tsconfig*.json`, `skills-lock.json`
- Misc: `bugfix.md`, `.gitignore`

Tracked-path concentration:

- `.trellis`: 1274 tracked paths
- `src`: 220
- `.agents`: 124
- `electron`: 63
- `browser-extension`: 62
- `desktop-assets`: 53
- `scripts`: 27
- `release-notes`: 19
- `docs`: 13

## Keep At Root

These are conventional or path-sensitive enough that moving them is not worth the homepage cleanliness gain.

| Entry | Reason |
|---|---|
| `README.md`, `README.en.md` | GitHub homepage and language entry points. |
| `LICENSE` | GitHub convention and license detection. |
| `package.json`, `package-lock.json` | npm convention, GitHub dependency graph, workflow `npm ci`. |
| `index.html`, `vite.config.ts` | Vite root conventions. Moving requires custom root config and more churn than value. |
| `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `tsconfig*.json` | Tooling conventions. Moving would require command/config rewrites and may break editor defaults. |
| `.github` | GitHub convention. |
| `.gitignore` | Git convention. |
| `AGENTS.md` | Project agent instructions are expected at repo root. |
| `.trellis` | Trellis workflow expects this path. Hide by GitHub collapse expectations, not by moving. |
| `.agents`, `.codex`, `.impeccable` | Agent tooling paths. Moving is likely to break local skills/plugins unless the tooling is reconfigured. |
| `src`, `electron`, `browser-extension`, `locales`, `public`, `scripts`, `docs` | Clear first-level product/source directories. |

## High-Risk To Move

These could move only with coordinated code, workflow, and spec updates.

| Entry | Evidence | Move Risk |
|---|---|---|
| `desktop-assets` | Referenced by `electron-builder.config.mjs`, `vite.config.ts`, runtime specs, and packaging scripts. Contains packaged runtime/icon assets. | High. Many scripts and specs assume this exact root path. |
| `release-notes` | Linked from both READMEs and hardcoded in `.github/workflows/release.yml` as `release-notes/v*.md`. | Medium/high. Could move, but release workflow and public README links must change together. |
| `app-icon.png` | Referenced by `electron-builder.config.mjs`, `electron/trayMenu.mts`, `electron/trayMenu.test.mts`, `scripts/package-macos-open-source-dmg.mjs`, and Trellis packaging guidance. | High. It is a runtime/tray/DMG input, not just a decorative homepage asset. |
| `background.png` | Referenced by `scripts/package-macos-open-source-dmg.mjs` and Trellis packaging guidance as the DMG background. | Medium/high. Move requires script and spec updates. |
| `distribution` | `scripts/package-macos-open-source-dmg.mjs` reads `distribution/macos/install-guide.txt`. | Medium. Only one known live script reference, but it affects release packaging. |
| `electron-builder.config.mjs` | Imported by scripts and used by package commands. | High. Keep at root. |

## Lower-Risk Cleanup Candidates

| Entry | Recommendation | Required Updates |
|---|---|---|
| `bugfix.md` | Move to `docs/engineering/bugfix-log.md` or `.trellis/workspace/bugfix.md` if it is now historical. | Update any current process docs if they still mention root `bugfix.md`. Most found references are archived Trellis tasks and old journals. |
| `app-icon.svg` | Move to `desktop-assets/icons/source/app-icon.svg` or `docs/assets/app-icon.svg`. | No live code references found. Update README/docs only if linked later. |
| `PRODUCT.md`, `DESIGN.md` | Keep for now, or move to `.agents/context/` only if all design tooling still loads it. | The Impeccable loader currently resolves root first and also falls back to `.agents/context/` and `docs/`, so this is possible but affects agent context discoverability. |

## Recommended Target Layout

Do a conservative cleanup first:

```text
/
  README.md
  README.en.md
  LICENSE
  AGENTS.md
  package.json
  package-lock.json
  index.html
  vite.config.ts
  electron-builder.config.mjs
  eslint.config.js
  postcss.config.js
  tailwind.config.js
  tsconfig*.json
  skills-lock.json

  src/
  electron/
  browser-extension/
  locales/
  public/
  scripts/
  docs/
    engineering/
      bugfix-log.md
  release-notes/
  desktop-assets/
    icons/
      source/
        app-icon.svg
  distribution/

  app-icon.png          # keep until packaging path cleanup is worth doing
  background.png        # keep until DMG path cleanup is worth doing
  PRODUCT.md            # keep unless agent context is intentionally moved
  DESIGN.md             # keep unless agent context is intentionally moved
```

This removes only the least useful root clutter (`bugfix.md`, `app-icon.svg`) while avoiding path-sensitive packaging churn.

## Optional Larger Cleanup

If the user wants a more aggressive second phase:

1. Move packaging assets into `desktop-assets/packaging/`:
   - `app-icon.png` -> `desktop-assets/packaging/app-icon.png`
   - `background.png` -> `desktop-assets/packaging/dmg-background.png`
   - `distribution/macos/install-guide.txt` -> `desktop-assets/packaging/macos/install-guide.txt`
2. Update:
   - `electron-builder.config.mjs`
   - `electron/trayMenu.mts`
   - `electron/trayMenu.test.mts`
   - `scripts/package-macos-open-source-dmg.mjs`
   - `.trellis/spec/guides/cross-platform-thinking-guide.md`
3. Run macOS packaging validation on macOS before trusting the change.

This would make the root cleaner, but it has release-packaging risk and should be a separate implementation task.

## Validation Checklist For Any Move

Minimum checks:

- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run package:browser-extension`

If packaging assets move:

- `npm run package:win:dir`
- `npm run package:macos-open-source-dmg -- --skip-build` on macOS when a packaged `.app` exists
- `npm run runtime:verify:macos-package -- arm64 require-execution require-downloader-bootstrap require-relocation-rebuild`
- Release workflow dry-run review for any `release-notes` path change

## Recommendation

Do not reorganize the full repository root in one pass. The root looks busy mostly because this repo intentionally hosts source, Electron packaging, browser extension, docs, release notes, localization, and agent workflow metadata together.

Best first cleanup:

1. Move `bugfix.md` under `docs/engineering/bugfix-log.md`.
2. Move `app-icon.svg` under `desktop-assets/icons/source/app-icon.svg`.
3. Add a short root `docs/README.md` or root README section that explains the main directories, so homepage scanning improves without risky moves.

Defer moving `app-icon.png`, `background.png`, `desktop-assets`, `distribution`, and `release-notes` until there is a dedicated packaging-path cleanup task.
