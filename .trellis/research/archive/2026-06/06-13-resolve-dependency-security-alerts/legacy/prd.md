# Resolve dependency security alerts in two phases

## Goal

Resolve the currently open GitHub Dependabot security alerts for the root app and docs site with a controlled two-phase dependency update plan.

Phase 1 should remove the high-value, low-risk alerts that can be addressed through patch/minor dependency updates. Phase 2 should separately evaluate the remaining `esbuild` alerts, because they may require a Vite/Astro major-version or override strategy and need broader compatibility validation.

## Confirmed Facts

- GitHub Dependabot reports 11 open alerts across `package-lock.json` and `site/package-lock.json`.
- Root `npm audit --json` reports 11 vulnerable package entries: 7 high, 4 moderate.
- `site/ npm audit --json` reports 6 vulnerable package entries, mostly through Astro/Starlight/Vite/esbuild.
- Root direct/runtime-relevant dependency:
  - `ws` is a direct dependency and is used in `electron/main.mts` for a localhost `WebSocketServer`.
- Root renderer/build dependencies:
  - `react-router-dom` is used by `src/main.tsx`.
  - `postcss`, `vite`, and `@vitejs/plugin-react` are build/dev dependencies.
- Root packaging-chain vulnerabilities are transitive through `electron-builder` and related packages:
  - `@xmldom/xmldom`
  - `tmp`
  - `ip-address`
  - `brace-expansion`
- `npm audit fix --dry-run` for the root project indicates several alerts can be addressed without forced major upgrades by moving to patched versions including `ws`, `react-router-dom` / `react-router`, `postcss`, `tmp`, `ip-address`, `brace-expansion`, `@xmldom/xmldom`, and a Vite 7 patch.
- The `esbuild` alerts are lower operational priority but may remain unless Vite/Astro/esbuild strategy is handled separately.
- `@vitejs/plugin-react@4.7.0` declares peer support for Vite `^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; moving to Vite 8 would require `@vitejs/plugin-react@6.x`.
- The root `test` script is `vitest run --passWithNoTests`; verification must confirm tests are actually discovered or treat the command as only one regression signal.

## Requirements

- Split remediation into two explicit phases:
  - Phase 1: low-risk root dependency remediation.
  - Phase 2: Vite/Astro/esbuild remediation and residual alert review.
- Do not mix large build-tool major upgrades into Phase 1 unless evidence shows they are required for the Phase 1 acceptance criteria.
- Do not use `npm audit fix` as an unchecked Phase 1 implementation command; update explicit target dependencies and review the resulting lockfile.
- Preserve existing app behavior and packaging workflows.
- Keep root app and docs-site dependency changes scoped to their respective manifests and lockfiles.
- Update only dependency manifests and lockfiles unless a compatibility break requires source/config changes.
- Run relevant verification after each phase and document any remaining accepted risk.

## Acceptance Criteria

- [x] A Phase 1 change plan exists for root `package.json` / `package-lock.json` that targets `ws`, `react-router-dom`, `postcss`, and packaging-chain transitive fixes.
- [x] A Phase 2 change plan exists for root and `site/` `esbuild` alerts, including whether to use Vite/Astro major upgrades, compatible minor/patch upgrades, overrides, or documented deferral.
- [x] After Phase 1 implementation, these root GitHub alerts are resolved or explicitly reclassified with evidence:
  - `GHSA-f6ww-3ggp-fr8h` (`@xmldom/xmldom`)
  - `GHSA-j759-j44w-7fr8` (`@xmldom/xmldom`)
  - `GHSA-x6wf-f3px-wcqx` (`@xmldom/xmldom`)
  - `GHSA-ph9p-34f9-6g65` (`tmp`)
  - `GHSA-58qx-3vcg-4xpx` (`ws`)
  - `GHSA-qx2v-qp2m-jg93` (`postcss`)
  - `GHSA-v2v4-37r5-5v8g` (`ip-address`)
  - `GHSA-49rj-9fvp-4h2h` (`react-router`)
  - `GHSA-2j2x-hqr9-3h42` (`react-router`)
- [x] After Phase 1 implementation, root checks pass: `npm run type-check`, `npm run lint`, `npm run test`, and `npm run build`.
- [x] After Phase 1 implementation, `npm ci` and `npm run package:dir` pass or any environment-specific blocker is documented.
- [x] After Phase 2 implementation, root and docs-site audits are re-run and remaining alerts, if any, are explicitly categorized with rationale.
- [x] If `site/` dependencies are changed, `npm run docs:build` passes.
- [x] GitHub Dependabot alert count is expected to drop after push; any alerts that cannot be closed locally are documented with the required follow-up.

## Notes

- Implementation completed in the active task.
- GitHub Dependabot alert count is expected to update after these dependency changes are pushed.
