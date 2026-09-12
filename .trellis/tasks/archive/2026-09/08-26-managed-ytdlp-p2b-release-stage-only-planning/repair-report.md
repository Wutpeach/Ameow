# P2-B stage-only repair report

Date: 2026-09-12. Active task: `.trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning`.

## Verdict: PASS for the implementable P2-B repair scope; STOP for retained external release gates

The independent 16-failure review reproduction was migrated into canonical root coverage where practical, then the three duplicate task-local fixture snapshots were removed. The production allowlist remains intentionally empty: no upstream release was approved, downloaded, staged, selected, activated, or made effective.

## Repair flow

`scripts/managed-ytdlp-package-set.mjs` is the canonical release contract for runtime, baseline helpers, release preparation, source verification, and package verification. It owns package-name/version normalization, safe release IDs, deterministic digests, package-set IDs, exact universal-wheel filename/tags, allowlisted targets, policy/probe validation, package uniqueness, and native ZIP/WHEEL/METADATA/dependency validation; `tsconfig.electron.json` emits that module into `dist-electron/scripts/` so the compiled Electron runtime resolves the same authority.

The stage flow is: parse app-owned manifest -> bounded exact-URL streaming download with approved maximum -> byte/hash validation -> enter `runMutation` -> native wheel structure proof before any candidate-tree mutation -> low-level bundled-Python plus managed FFmpeg/FFprobe/Deno identity preparation -> bounded isolated venv/pip/metadata/probe -> marker-last commit -> atomic catalog eligibility write. Cache hits reread marker under the mutation, prove marker/package/catalog/current-Python/media identities, wheel bytes, venv Python/entrypoint, and installed package versions; any conflict is quarantined in the catalog without changing committed bytes.

Inspection is read-only. It enumerates marker-backed candidates independently of the catalog, reports marker-only candidates as `observation: "marker_only"` without invented eligibility, preserves persisted eligibility with `observation: "marker_mismatch"` when marker consistency is absent, and reports corrupt/unsupported catalogs as an observation error while keeping safe marker observations.

## R1-R8 disposition

| Item | Result | Evidence |
| --- | --- | --- |
| R1 strict shared authority, safe IDs, schema/proof and wheels | Resolved | Canonical module is used by runtime/tooling; root strict-policy parameter test, deterministic real ZIP fixture, malformed archive pre-materialization test, source/package verifiers. |
| R2 mutation-local cache revalidation | Resolved | Root cache test covers missing entrypoint, changed Deno identity, incomplete catalog proof, immutable quarantine. |
| R3 bounded isolated subprocess settlement | Resolved | Shared `managedPythonCommandOptions` is used for venv/pip/metadata/probe; every candidate child has a timeout and isolated Python/PIP environment. Process root test covers a timeout with an unowned mocked handle; Windows PID children receive `taskkill /T /F` escalation. |
| R4 pure observed versus persisted lifecycle facts | Resolved | Root inspection test covers marker-only, marker-mismatch persisted eligibility, corrupt proof sanitization, and no lifecycle fabrication. |
| R5 low-level candidate dependency preparation | Resolved | `prepareManagedYtDlpCandidateProbeInputs` obtains only bundled Python and app-owned media identities; root production-body test proves no bundled yt-dlp baseline bind/materialization path. |
| R6 approved streaming maximum | Resolved | Shared downloader rejects Content-Length or chunk overflow before the oversized write; root streaming test proves early cancellation. |
| R7 packaging/verifier enforcement | Resolved | `run-electron-package.mjs` invokes managed source verification before Builder and package verification after Builder; root package tests cover success plus missing/corrupt/mismatched packaged resources; overlap equality is complete canonical contract equality. |
| R8 typed bounded pre-stage failures | Resolved | `ManagedYtDlpStageError` provides `approval`, `download`, `integrity`, and `materialization` categories while keeping failures candidate-local and leaving Report/UI behavior unchanged. |

## Checks

```text
npx vitest run [17 focused root files] --exclude .trellis/** --exclude .cindy-worktrees/**
PASS: 17 files, 227 tests

npm run type-check
PASS
npm run lint
PASS
npm run build
PASS (existing Vite large-chunk/plugin-timing advisories only)

npm run runtime:verify:ytdlp-baseline
PASS
npm run runtime:verify:ytdlp-managed-release
PASS: 0 approved releases

git diff --check -- .gitignore electron electron-builder.config.mjs package.json scripts src desktop-assets tsconfig.electron.json .trellis/spec/backend/electron-runtime-contracts/07-electron-managed-runtime-bootstrap-module-contract.md
PASS

Compiled runtime module import: dist-electron/electron/ytDlpPackageSet.mjs
PASS: canonical runtime module loads
```

The focused root suite includes P2-A baseline, lifecycle lease, attempt/runtime, Diagnostics, command, and Report-repair regressions; no duplicate worktree was counted. Source/package fixture verification is deterministic and local; no network release evidence was treated as approval.

## Deliberate boundaries and external gates

No activation, selection.json, rollback/history, GC, retry/cancel/downloader authority, updater, Repair Center, UI, or Diagnostics mutation was added. The retained external gates remain open: clean-host Windows Electron Builder and default-userData validation, portable replacement retention, live EJS challenge, macOS arm64 fresh-quarantine/offline-baseline/Gatekeeper validation, and an explicitly reviewed nonempty Ameow allowlist entry with real provenance/bytes.
