# P2-B managed yt-dlp stage-only implementation report

## Verdict

**PASS — source implementation and local verification.**

**STOP — retained external evidence gates.** The packaged allowlist is intentionally valid but empty, so no real upstream release is approved or staged. No clean-host Windows/macOS package artifact, live EJS qualification, or retained P2-A release gate was run in this implementation task.

## Authority and persisted-fact flow

`desktop-assets/binaries/ytdlp-managed-releases.json` is the only runtime approval source. It currently contains zero releases; preparation tooling accepts explicit `--version` and `--package` values, verifies PyPI wheel evidence, and prints/writes review evidence only. It never edits the allowlist and never discovers or authorizes a latest release at runtime.

`stage_managed_ytdlp_release` accepts exactly `{ releaseId }`; arbitrary version, URL, activation, rollback, cleanup, and update-all inputs are rejected or absent. The stage module resolves that ID from the packaged allowlist, downloads each exact HTTPS `files.pythonhosted.org` wheel to an isolated target-scoped temporary directory with redirect rejection, stall bounds, expected byte size, and SHA-256 checks. Every temporary download is removed on failure before materialization starts.

After every asset is locally verified, one existing `runtimeSetLifecycle.runMutation` creates the target-scoped immutable candidate. It obtains the pre-existing bundled Python and app-owned FFmpeg/FFprobe/Deno facts, runs hash-locked offline `pip` with no index/dependency/user site, verifies the installed package set, writes `release.json` last, then runs a bounded isolated `--version` probe with app-owned Deno. The target catalog is atomically rewritten only with structured `passed`, `failed`, or `quarantined` eligibility facts; marker/package identity conflicts and cache integrity failures quarantine instead of overwriting a committed candidate.

`get_managed_ytdlp_releases` and Diagnostics only parse the packaged allowlist, target catalog, and addressed committed markers. They do not fetch, hash candidate payloads, create directories, ensure readiness, enter a mutation, take a lease, probe, or clean. Marker/catalog consistency is checked so a catalog-only or stale record cannot be observed as eligible. Effective selection remains `bundled`; no selection is persisted and no production attempt, adapter, runner, or orchestrator import path was changed.

## P2-B files changed

- `.gitignore` — tracks the source-controlled production allowlist despite the binary-assets ignore rule.
- `desktop-assets/binaries/ytdlp-managed-releases.json` — valid empty production allowlist.
- `electron/ytDlpPackageSet.mts` and `electron/ytDlpBaseline.mts` — canonical package normalization, package-set identity, policy/probe, digest, and requirements-lock reuse; baseline pins and binding semantics remain unchanged.
- `electron/managedYtDlpRelease.mts` — strict allowlist parsing, acquisition, staged candidate marker/catalog lifecycle, bounded probe, and pure inspection.
- `electron/managedYtDlpReleaseCommands.mts`, `electron/main.mts`, `src/types/electronBridge.ts` — explicit `get_managed_ytdlp_releases` / releaseId-only `stage_managed_ytdlp_release` command bridge through the existing generic preload transport.
- `electron/diagnostics.mts`, `src/types/diagnostics.ts` — persisted read-only candidate facts with bundled effective selection.
- `electron/managedRuntimeBootstrap.mts` — reuse the existing route-aware streaming boundary with explicit request/response policy hooks and a bounded captured-command option.
- `src/electron-runtime/runtimePaths.ts`, `electron-builder.config.mjs` — pure target candidate roots, packaged manifest lookup, and exact builder resource inclusion.
- `scripts/managed-ytdlp-release-manifest.mjs`, `scripts/prepare-ytdlp-managed-release.mjs`, `scripts/verify-ytdlp-managed-release.mjs`, `scripts/verify-ytdlp-managed-release-package.mjs`, `package.json` — explicit release-prep evidence plus source/package verification.
- `electron/managedYtDlpRelease.test.mts`, `electron/managedYtDlpReleaseCommands.test.mts`, `scripts/verify-ytdlp-managed-release-package.test.mts` — deterministic stage, policy, cache, probe, command, and package-verifier coverage.

The pre-existing changes in `electron/errorDiagnosticCopy.mts`, `electron/errorDiagnosticCopy.test.mts`, and `electron/errorDiagnosticCommands.test.mts` were preserved and not modified as P2-B work.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| Approval and policy attacks | Strict allowlist-derived ID; releaseId-only bridge; HTTPS exact host and redirect rejection tests. No runtime upstream metadata, latest lookup, URL, or self-update authority. |
| Byte/package integrity | Per-wheel size/SHA checks before mutation; staged cache-hit rehash; strict wheel filename/package-set validation; hash-locked offline pip. |
| Atomic/crash boundaries | No marker means no candidate; marker is written last; catalog is temp-write/rename; marker-backed candidates are never replaced. |
| Identity, duplicate, quarantine | Canonical digest-derived release ID; exact cache hit skips download; marker/catalog/Python identity conflict quarantines. A different byte set derives a different release ID. |
| Target/Python/policy | Target allowlist, minimum Python, package set, execution policy, no config/plugins/remote components, and managed absolute Deno probe arguments are validated. |
| Probe and per-asset failures | Probe failure retains a committed marker with failed eligibility; wheel network/size/hash failures delete temporary bytes with no candidate. |
| Lease and baseline regression | Stage uses the existing mutation coordinator, so a lease fails busy before final mutation. Existing P2-A baseline/lifecycle tests passed; candidate code has no binding/adapter/orchestrator dependency. |
| Passive Diagnostics | Inspection reads only persisted declaration/catalog/marker facts and forces forged/stale catalog records to quarantined; it has no lifecycle callbacks. |
| Source/package/pinning self-check | Baseline verifier passed; empty managed manifest source verifier passed; deterministic package-layout verifier passed; baseline canonical helper reuse is covered by existing baseline tests. |

## Exact validation results

```text
npx vitest run electron/managedYtDlpRelease.test.mts electron/managedYtDlpReleaseCommands.test.mts electron/ytDlpBaseline.test.mts electron/runtimeSetLifecycle.test.mts electron/diagnostics.test.mts electron/diagnosticsCommands.test.mts scripts/verify-ytdlp-managed-release-package.test.mts scripts/verify-ytdlp-baseline-package.test.mts
# PASS: 118 files, 513 tests

npm run type-check
# PASS

npm run lint
# PASS

npm run build
# PASS (Vite reported pre-existing chunk-size advisory only)

npm run runtime:verify:ytdlp-baseline
# PASS

npm run runtime:verify:ytdlp-managed-release
# PASS: 0 approved releases

git diff --check -- .gitignore electron electron-builder.config.mjs package.json scripts src desktop-assets
# PASS
```

The unscoped `git diff --check` still reports CRLF/trailing-whitespace lines in the pre-existing modified task JSON. That file was not touched by this implementation.

## Deferred and external gates

- No real managed release is approved. Adding one requires an explicit reviewed allowlist entry; generated preparation evidence is not authorization.
- Source/package verifier logic is covered with isolated fixtures. Running package verifiers against a real clean-host Windows/macOS artifact remains a release gate.
- No activation/effective selection, `selection.json`, attempt binding, adapter/orchestrator dependency, rollback, retention/GC, restart switch, UI, Repair Center, real candidate download use, or Diagnostics mutation was implemented.
