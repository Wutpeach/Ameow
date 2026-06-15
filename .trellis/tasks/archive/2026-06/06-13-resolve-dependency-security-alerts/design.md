# Design

## Scope

This task covers dependency security remediation for:

- Root desktop app manifests: `package.json`, `package-lock.json`.
- Documentation site manifests: `site/package.json`, `site/package-lock.json`.

It does not cover unrelated dependency modernization, app version bumps, release notes, or feature changes.

## Phase 1: Low-Risk Root Remediation

Phase 1 targets alerts that have straightforward patch/minor remediation and limited compatibility risk:

- `ws`: update direct runtime dependency to `8.21.0` or newer 8.x.
- `react-router-dom` / `react-router`: update within React Router 7.x, targeting `7.17.0`.
- `postcss`: update within 8.x, targeting `8.5.15`.
- `electron-builder`: update within 26.x, targeting `26.15.3`, so transitive packaging-chain dependencies can move to patched releases:
  - `@xmldom/xmldom >= 0.8.13`
  - `tmp >= 0.2.6`
  - `ip-address > 10.1.0`
  - `brace-expansion >= 5.0.6`

Phase 1 targets these root GitHub advisories:

- `GHSA-f6ww-3ggp-fr8h`, `GHSA-j759-j44w-7fr8`, `GHSA-x6wf-f3px-wcqx` (`@xmldom/xmldom`)
- `GHSA-ph9p-34f9-6g65` (`tmp`)
- `GHSA-58qx-3vcg-4xpx` (`ws`)
- `GHSA-qx2v-qp2m-jg93` (`postcss`)
- `GHSA-v2v4-37r5-5v8g` (`ip-address`)
- `GHSA-49rj-9fvp-4h2h`, `GHSA-2j2x-hqr9-3h42` (`react-router`)

Phase 1 should not force Vite 8, `@vitejs/plugin-react` 6, Astro major changes, docs-site build-system changes, or unchecked Vite lockfile drift. If `electron-builder@26.x` does not move all packaging-chain transitive dependencies to patched versions, evaluate narrow `overrides` for those transitive packages before broad build-tool upgrades.

## Phase 2: Esbuild / Build Tool Strategy

Phase 2 handles remaining `esbuild`-related alerts separately because patched `esbuild >= 0.28.1` may not be reachable through current root Vite 7 and Astro 6 dependency ranges without a broader strategy.

Evaluate these options in order:

1. Patch/minor upgrades inside existing major ranges:
   - root `vite@7.x`
   - `site/astro@6.x`
   - `site/@astrojs/starlight@0.x`
2. If root Vite moves to 8.x, update `@vitejs/plugin-react` to the compatible 6.x line.
3. If alerts remain, evaluate package-manager `overrides` for `esbuild >= 0.28.1`, but only if root build and docs build pass.
   - Treat this as a compatibility risk because `esbuild` is a binary build tool; validate the executable and build outputs, not just dependency resolution.
4. If overrides are incompatible, evaluate major upgrades:
   - root `vite@8` and `@vitejs/plugin-react@6`
   - docs-site Astro/Starlight compatible updates
5. If the remaining alert is low severity and only affects local dev-server exposure, document deferral with rationale and required follow-up trigger.

## Boundaries And Compatibility

- Root Electron renderer currently uses React Router through `BrowserRouter`, `HashRouter`, `Routes`, and `Route`; React Router updates must preserve these APIs.
- Root Electron main process uses `WebSocketServer` from `ws`; the update must preserve the existing localhost server behavior.
- Packaging-chain updates must not change packaging commands or output layout unless a dependency update requires an explicit compatibility fix.
- Packaging-chain updates require `npm run package:dir`, not only `npm run build`, because `electron-builder` transitive updates affect packaging behavior.
- A clean install check with `npm ci` should pass after lockfile changes.
- Docs-site updates must preserve Starlight/Astro build output.
- `brace-expansion` has multiple resolved major lines in the dependency tree; only the vulnerable 5.x line must be `>=5.0.6`, while 1.x and 2.x instances are outside the reported vulnerable range.

## Rollback

Each phase should be independently revertible by reverting the manifest and lockfile changes from that phase.

If Phase 2 requires major build-tool changes, keep it as a separate commit from Phase 1 so root runtime/security fixes are not blocked by build-tool compatibility issues.
