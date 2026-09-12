# P2-B independent check report

Date: 2026-09-12 (local session). Active task: `.trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning`.
Orca task `task_5aba4ba2b891`, dispatch `ctx_1157609738ae`.

## Verdict: REPAIR

The stage-only implementation is **not accepted**. The isolated root suite passes **16 files / 212 tests**, and type-check, configured lint, build, baseline source verification, and empty managed-allowlist source verification pass. Independent task-local acceptance tests produce **16 failures and 2 passes across 3 files**. These are actual assertion failures against the current production functions, not inferred from the implementation report. The implementation report's source PASS is superseded by this review.

Three bounded candidate-storage safeguards were fixed and tested. The remaining repairs cross shared schema, dependency composition, eligibility observation, and process-settlement contracts; they require a bounded implement phase, not mechanical reviewer edits. No real release was approved, no live candidate staged, no commit/branch/archive/task-metadata operation performed.

## Scope and method

Read the dispatched role, task check context, PRD/design/implement plan, original repository-grounded P2-B report, implementation report, P2-A design, and applicable Electron runtime/command leaf contracts. Reviewed the complete tracked production diff and every new P2-B production/test/tooling file. Traced `main.mts` command registration and stage composition through candidate acquisition, the shared download helper, lifecycle coordinator, subprocess functions, marker/catalog writes, pure inspection, and Diagnostics projection. Inspected packaging entrypoints rather than assuming the new verifier is invoked.

Preserved the existing Report repair files (`errorDiagnosticCopy.mts` and its two test files), `.codex/agents/trellis-check.toml`, `.trellis/tmp/`, checkpoint task, and Lead-owned task metadata/artifacts. Their relevant Report tests ran in the isolated root suite. No nested workers.

The original implementation command's 118-file/513-test result included duplicated checkouts and is not focused evidence. Root checks below explicitly exclude both duplicate trees. Deliberately failing review reproductions are separate, explicitly addressed task-local files; they are not represented as passing root tests.

## Findings fixed

### F1 — Runtime release identities could escape `versions/`

`parseApprovedRelease` accepted any nonblank version and derived `<version>-<digest>`. A digest suffix does not neutralize `../../` in that version. Catalog `releaseId` also passed through `requiredString` into `candidatePaths` and marker reads.

**Fix:** validate a safe version token; require a single numeric-version/digest release-ID segment in marker/catalog parsing and again before candidate path joining. This does not attempt to invent a complete new PEP 440 parser. Runtime rejects unsafe identities before network or filesystem creation. Tooling's separate parser still needs unification (R1).

**Tests:** `rejects a canonical digest whose version escapes the candidate directory`; `rejects catalog traversal before marker inspection`.

### F2 — Corrupt/unsupported catalog could be silently replaced

`writeCandidateCatalogRecord` used `loaded.catalog?.candidates ... ?? []`, discarding unknown persisted state after parse failure.

**Fix:** reject corrupt or unsupported catalog state before writing. Missing catalogs may start empty. Existing bad bytes remain unchanged. If the failure occurs after marker commit, the immutable marker remains; its observation gap is R4, not a reason to delete it.

**Tests:** parameterized corrupt JSON and schema 999 cases preserve the exact prior bytes after stage failure.

### F3 — A raced invalid marker permitted deletion of a committed directory

The post-download mutation branch treated `readMarker() === null` as incomplete even when a marker had appeared since preflight, then recursively removed the candidate root.

**Fix:** recheck marker existence inside the mutation before removal; an existing invalid marker yields quarantine and leaves marker/payload unchanged.

**Test:** inject an invalid marker and sentinel between preflight and mutation; stage returns quarantined, both remain byte-identical, materialization never runs.

These safeguards are captured in the existing `07-electron-managed-runtime-bootstrap-module-contract.md` leaf only. No broad historical-document cleanup or roadmap was added.

## Findings not fixed — bounded implementation instructions

### R1 — Shared strict package/manifest contracts are incomplete (high)

Files: `electron/ytDlpPackageSet.mts`, `electron/managedYtDlpRelease.mts`, `scripts/managed-ytdlp-release-manifest.mjs`, release-prep/source/package tooling.

The runtime shares a few helpers with baseline, but the MJS tools separately implement normalization, package-set identity, release identity, policy and parsing. The divergence is executable: the build validator accepts duplicate packages, credential-bearing provenance URLs, invalid minimum-Python tuples, and traversal-bearing versions. `!names.add(...)` / `!files.add(...)` never detects duplicates because `Set.add` returns the truthy Set. Runtime validation is stronger in some places but still only checks a loose wheel filename regex, does not bind wheel tags/name/version to the package declaration, permits unknown/empty targets, and does not enforce strict digest/version/proof schemas on persisted records. Marker parsing silently filters invalid installed-version values rather than rejecting the marker.

The runtime accepts an unrelated Linux CPython wheel filename for a Windows universal-wheel fixture and proceeds to download/materialize it. Release prep chooses a `py3-none-any.whl` suffix from upstream metadata, verifies bytes, and emits evidence; it never inspects ZIP members, distribution METADATA/WHEEL identity, dependency metadata, or agreement with the declared package set. Offline pip may reject some archive defects later, but that happens inside mutation and is not the planned pre-mutation package-structure verification. The reviewer fixtures use fake wheel bytes and mocked pip; their successful staging is not archive proof.

**Repair:** one canonical parser/normalizer/policy/digest path usable by baseline/runtime/tooling; explicit supported target and universal wheel identity checks; inspect approved wheel archive and metadata before runtime mutation (reuse existing bundled Python/stdlib or installed tooling rather than inventing an archive framework); verify complete dependency declaration without enabling dependency resolution. Add actual deterministic wheel fixtures. Retain existing baseline pins and baseline-overlap behavior. Reject malformed marker/catalog fields instead of silently coercing them.

**Evidence:** four `build validator rejects invalid ... policy` failures and `approved manifest rejects mismatched wheel tags and names before network` in `check-regressions.test.mts`. Source trace establishes missing archive inspection and separate canonical implementations.

**Why not reviewer-fixed:** replacing the duplicated public schema/identity authority and defining archive checks is material implementation work; merely fixing the obvious Set call would leave the shared-contract acceptance unmet.

### R2 — Cache reuse can return passed for invalid materialization or stale proof (high)

File: `electron/managedYtDlpRelease.mts`, both the preflight-marker and mutation-race cache branches.

The cache path rehashes preserved wheel copies, but does not verify the installed venv/entrypoint or installed-package facts. A missing `venv/Scripts/yt-dlp.exe` still returns passed. Current FFmpeg/FFprobe/Deno identity changes are ignored. Catalog reuse checks only release-ID lookup and Python digest equality; it accepts a wrong catalog version/package set and passed proof with missing observed version or dependency digests. `markerMatches` ignores installed versions. The preflight marker object is also captured outside mutation instead of reread as authoritative under the boundary.

**Repair:** use one mutation-local cache validation path in both branches. Compare full approved/marker/catalog identity and required proof; validate current Python target/version and media dependency identity; verify the installed materialization and entrypoint sufficiently to reject missing/changed executable state, not just retained wheel inputs. Quarantine conflicts without rewriting committed bytes. Add cache tests for each field and current-dependency mismatch. Do not activate or rebuild committed candidates in place.

**Evidence:** missing-entrypoint, changed-current-Deno, and incomplete/full-identity cache acceptance failures. These all return `passed` today.

**Why not reviewer-fixed:** choosing/implementing sufficient installed-materialization integrity proof and consolidating both lifecycle branches requires the planned implementation contract, not an extra existence guard alone.

### R3 — Subprocess isolation and bounded settlement are not complete (high)

Files: `electron/managedYtDlpRelease.mts`, `electron/managedRuntimeBootstrap.mts`.

Only the final version probe has `timeoutMs`. Venv creation, offline pip, and installed-version inspection can hold `runMutation` indefinitely. The captured helper sends one `child.kill()` and awaits `close` indefinitely; its new timeout is not a bounded-settlement guarantee when termination fails or is ignored. The fake child test advances 60 seconds after a 10 ms timeout, observes the promise still pending, then explicitly emits close to clean up. This proves helper behavior, not a claim that a real Windows child ignored a kill during this review. Process-tree settlement is not implemented by this helper.

Venv creation and metadata inspection receive no isolation environment; the final probe inherits the ambient environment. Pip adds `PYTHONNOUSERSITE=1`/`PIP_NO_INDEX=1` but retains ambient Python variables and configuration. Probe arguments include app-owned Deno, config/plugin/remote-component disabling, but omit the app-owned FFmpeg location, and FFprobe is not explicitly tied into probe execution. The `--version` probe does not itself exercise media tools; mechanical tool-identity verification must remain separate and explicit.

**Repair:** bounded execution and confirmed owned-process-tree settlement for all child work held by the mutation, with termination escalation where supported; isolate Python/site/environment consistently across venv, pip, metadata, and probe; bind/revalidate only app-owned Deno/media paths. Reuse existing process settlement primitives, and do not release the mutation merely because a timeout clock fired while a child remains alive. Add environment and settlement tests, including termination failure and descendant handling.

**Evidence:** `all subprocesses ... explicit bounds and Python isolation`, missing `--ffmpeg-location`, and captured-timeout tests fail. No live process was left running by the review.

### R4 — Passive observation does not preserve persisted lifecycle facts or all staged state (high)

Files: candidate inspection, `electron/diagnostics.mts`, `src/types/diagnostics.ts`.

Inspection iterates catalog entries only. A marker committed before a crash/catalog write is invisible. For stale/missing markers it rewrites the returned eligibility to `quarantined` while retaining the old probe timestamp, even though no lifecycle operation persisted that result. Diagnostics labels it a persisted stage fact. The catalog parser accepts arbitrary strings for versions/digests; a synthetic path in `ytDlpVersion` and credential URL in `denoIdentityDigest` are returned verbatim by inspection and passed through Diagnostics. No real secret was used in the tests.

**Repair:** represent observed marker/catalog consistency separately from persisted eligibility; expose marker-backed candidates with no eligibility record as staged/unprobed without inventing an outcome; validate/sanitize bounded identity/probe fields at the file trust boundary. A corrupt catalog should produce an observation error, not erase other marker facts or invent eligibility. Keep inspection free of payload hashing, fetch, readiness, probes, mutation, leases, writes, and cleanup. Update the narrow inspection/Diagnostics types and tests together.

**Evidence:** marker-only, fabricated-lifecycle-result, and synthetic privacy-leak assertions fail. The function remains I/O-read-only today, which is necessary but insufficient for correct passive facts.

**Why not reviewer-fixed:** this requires the planned persisted-versus-observed DTO distinction and crash-state representation across modules; silently changing a public type in review would be a design change.

### R5 — Production dependency composition prepares bundled yt-dlp (high)

File: `electron/main.mts`, `prepareManagedYtDlpCandidateProbeDependencies`.

Production calls `ensureRuntimeSetCapabilities(RUNTIME_SET_CONSUMER_CAPABILITIES["yt-dlp"])`, then `createBundledYtDlpRuntimeBinding`. That capability set includes `yt-dlp`; the function calls `ensureBundledYtDlpBaselineReady`. Candidate staging can therefore materialize/rebuild bundled baseline and depends on baseline readiness even though the plan requires only low-level bundled Python/media inputs. It invalidates shared executable-readiness cache as part of this path. The lifecycle coordinator itself correctly clears prepared capabilities after mutation and does not publish managed readiness; that distinction must be preserved.

**Repair:** compose the candidate's verified bundled-Python and app-owned FFmpeg/FFprobe/Deno facts directly from the existing low-level readiness/identity paths. Do not invoke a bundled yt-dlp binding or repurpose `yt-dlp` capability preparation. If a small extraction from baseline is necessary, prove unchanged baseline identity and attempt behavior. Do not introduce a second downloader or selector.

**Evidence:** a test evaluates the actual production function body with injected dependency spies and observes `yt-dlp` in the ensure request. Source tracing confirms the baseline materialization/binding calls. This is composition coverage without launching Electron, not packaged-app proof.

### R6 — Streaming acquisition has no approved-size bound (medium/high)

Files: `downloadRelease` and shared `downloadToFile`.

The size check occurs after the complete response is written. A server can stream beyond the approved size while continuing to reset the stall timer. The real-helper stage fixture declares 9 bytes, consumes all 20 eight-byte chunks plus EOF, then rejects size. Cleanup and pre-mutation rejection work, but acquisition is not bounded by the approved artifact size.

**Repair:** pass the approved maximum into the shared streaming boundary (optional for unrelated callers), reject Content-Length overflow when present and abort/cancel before writing a chunk that exceeds the bound; settle stream handles before cleanup. Retain hash/size verification before mutation. Reuse existing route/stall mechanics.

**Evidence:** `check-network-stage.test.mts` fails its early-stop assertion with `chunksRead === 21`. Its final-host-change test passes. The route-aware helper test also passes: `redirect: error` reaches the adapter and final-URL policy rejects before destination creation. Existing stall/complex-route tests pass in the root suite.

### R7 — Build/package verifier is present but not enforced; overlap verification incomplete (medium)

Files: `scripts/run-electron-package.mjs`, new verifier scripts, `package.json`.

Electron Builder includes the exact allowlist resource, and the fixture package verifier succeeds. However, the actual package entrypoint invokes only the baseline source/package verifiers. The new managed source script is manually callable; the managed package verifier is referenced only from its fixture test. Thus an invalid allowlist does not necessarily fail the packaging path as planned. The overlap verifier compares only selected package fields, omitting execution policy/probe/minPython/target and provenance equality required by the original shared-contract plan.

**Repair:** wire managed source verification before packaging and packaged verification after Builder alongside existing baseline checks; use shared canonical equality for the complete required overlap contract. Add nonempty invalid-source, missing/corrupt/mismatched packaged-resource, and policy/probe overlap fixtures. Do not require a real release approval to exercise these tests.

**Evidence:** inspected package command and repository references. Existing managed package test covers only successful copying of the empty source allowlist; this is not negative/nonempty verification coverage.

### R8 — Pre-stage failures are not structured typed outcomes (medium)

The design calls for typed pre-stage failure outcomes; the implementation throws generic `Error` strings for network/policy/integrity/materialization failure, and `ManagedYtDlpStageResult` models only committed candidates. Probe mismatch persists arbitrary first-line stdout as `ytDlpVersion`. The existing command controller forwards results/errors unchanged.

**Repair:** use the smallest existing typed error/result mechanism to distinguish bounded failure categories and sanitize surfaced metadata; retain cleanup and keep failures candidate-local. Do not refactor the report system. Coordinate with R1/R4 so observed version data is bounded and cannot contain raw paths/errors.

**Evidence:** source error/result definitions and privacy acceptance failure. No new reporter/UI behavior should be introduced.

## Ten execution criteria — evidence mapping

| Criterion | Result | Evidence / limit |
| --- | --- | --- |
| 1. Packaged app-approved authority; explicit releaseId only | PARTIAL | Empty source allowlist and strict controller extra-key rejection work; no latest/GitHub/self-update path. R1/R7 block full schema/package approval proof. |
| 2. Acquisition/verification failure cannot leave a valid-looking candidate | PARTIAL | Second-asset network/size/hash/redirect failures never enter mutation; cleanup and no observed candidate verified. Package-structure validation is late/missing; R1/R6/R8 remain. |
| 3. Identity-stable immutable commit and idempotency | PARTIAL | Exact release cache avoids redownload; same version/different bytes produces two candidates; marker-last code order and F3 race preservation verified. Cache proof and marker-only crash visibility remain R2/R4. |
| 4. Persisted structured eligibility | REPAIR | Passed/failed/quarantined catalog and failed probe retaining marker exist. Required proof parsing, typed failures and observed/persisted separation fail R1/R2/R4/R8. |
| 5. Necessary integrity revalidation on cache hit | REPAIR | Wheel hashes revalidated, but missing entrypoint, stale dependency and incomplete proof are accepted (R2). |
| 6. Per-asset failure isolation | PARTIAL | All four second-asset rejection cases pass before dependency preparation/mutation. Production may prepare baseline for candidate work (R5). Catalog corruption now preserves unrelated bytes (F2). |
| 7. Bundled remains effective; new attempt binding unchanged | PASS for source boundary | No candidate import in attempt/adapter/orchestrator; changed runtime paths add only candidate root/manifest lookup. Existing service, yt-dlp plan/download and baseline tests pass. Selection is constant bundled; no managed binding path. |
| 8. P2-A lease/pinning and shared readiness semantics retained | PARTIAL | Real coordinator busy test blocks before final directory; incoming leases wait through paused probe and then prepare bundled capability; no managed capability readiness published. R3 makes the hold potentially unbounded; R5 touches baseline preparation. |
| 9. Pure passive Diagnostics, safe persisted facts | REPAIR | Inspection has no network/hash/readiness/mutation/lease/write/probe/cleanup callbacks and does not activate anything. Synthetic privacy leak, invented quarantine and marker-only omission fail (R4). |
| 10. Required regression/checks and honest external gates | PARTIAL / REPAIR | Root 212 pass; configured type/lint/build and source checks pass; package fixtures pass. Independent acceptance has 16 failures; no package/live gate closed. Existing Report repair tests passed and files preserved. |

No activation, automatic updater, UI, Repair Center, selection persistence, GC, rollback, retry/cancel authority, or Report refactor was added. Runtime gate and attempt production files remain outside the P2-B diff, apart from additive candidate lookup helpers in runtimePaths.

## Exact verification commands and counts

Run from `D:\Ameow` in PowerShell. Logs are in this task directory; they are local durable evidence even where the repository ignores `*.log`.

```powershell
npx vitest run electron/managedYtDlpRelease.test.mts electron/managedYtDlpReleaseCommands.test.mts electron/ytDlpBaseline.test.mts electron/runtimeSetLifecycle.test.mts electron/managedRuntimeBootstrap.test.mts electron/diagnostics.test.mts electron/diagnosticsCommands.test.mts electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts electron/supportLogExport.test.mts electron/runtimeDependencyGate.test.mts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts scripts/verify-ytdlp-managed-release-package.test.mts scripts/verify-ytdlp-baseline-package.test.mts --exclude '.trellis/**' --exclude '.cindy-worktrees/**'
# PASS: 16 files, 212 tests; check-focused.log.
# Earlier review run: same 16 files, 205 tests before adding 7 boundary cases.

npx vitest run .trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning/check-regressions.test.mts .trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning/check-boundaries.test.mts .trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning/check-network-stage.test.mts --exclude '.cindy-worktrees/**'
# FAIL (exit 1): 3 files, 16 failed / 2 passed = 18 tests; check-regressions.log.
# Intentional exact task-local paths; no broad .trellis search or duplicate-root counting.

npm run type-check
# PASS; check-types.log. Production renderer and Electron tsc; test files are excluded by repo tsconfigs.
npm run lint
# PASS; check-lint.log. Configured command is eslint src vite.config.ts --ext .ts,.tsx (not an Electron-wide lint claim).
npm run build
# PASS; check-build.log. Renderer plus Electron compilation. Existing large-chunk/plugin-timing advisories only.
npm run runtime:verify:ytdlp-baseline
# PASS; check-baseline-verifier.log. Verifies packaged source manifest/wheel bytes and baseline pin contract.
npm run runtime:verify:ytdlp-managed-release
# PASS, zero approved releases; check-managed-verifier.log. Empty allowlist success does not validate the rejected nonempty cases.
git diff --check -- .gitignore electron electron-builder.config.mjs package.json scripts src desktop-assets .trellis/spec/backend/electron-runtime-contracts/07-electron-managed-runtime-bootstrap-module-contract.md
# PASS; check-diff.log. Unrelated pre-existing task-metadata whitespace is deliberately outside this check.
```

Both baseline and managed package verifier scripts are exercised by their explicit root fixture test files above. The managed fixture subprocess is `node scripts/verify-ytdlp-managed-release-package.mjs --output-root <isolated-temp-fixture>`. No claim is made that a real clean-host Electron Builder package was verified here. Task-local fake-process test manually settles its mock; network tests use deterministic local Response streams and no public network release.

## Review-owned changes

- `electron/managedYtDlpRelease.mts`: F1/F2/F3 only.
- `electron/managedYtDlpRelease.test.mts`: 12 added tests (5 safeguard cases plus 7 asset/lifecycle/identity cases), 17 candidate tests total.
- `.trellis/spec/backend/electron-runtime-contracts/07-electron-managed-runtime-bootstrap-module-contract.md`: verified storage safeguards and executable test references only.
- This task's `check-report.md`, `check-regressions.test.mts`, `check-boundaries.test.mts`, `check-network-stage.test.mts`, and `check-*.log` files.

Task-local fixture snapshots are deliberately independent reproductions for the repair phase, not reusable production helpers. Move the acceptance assertions into canonical root tests as each repair lands, removing duplicated fixture snapshots when no longer needed. No production allowlist entry was changed.

## Remaining external gates

The empty production allowlist is intentional; deterministic fixtures confer no approval on an upstream release. A real nonempty entry still needs explicit Ameow release approval and review of bytes/provenance/package evidence. Retained P2-A gates remain unchanged: clean-host Windows Electron Builder, Windows default-userData, portable replacement retention, successful live EJS challenge, macOS arm64 fresh quarantine/offline baseline/Gatekeeper. No release gate was expanded or claimed closed.

## Handoff

Dispatch a bounded implement repair for R1–R8 under the same stage-only scope, then rerun root and independent acceptance checks. Keep the three verified safeguards. Prioritize shared strict schema/materialization proof and production low-level dependency/process composition, then repair observation DTOs and packaging enforcement. **Do not merge or mark P2-B accepted on the current passing root suite alone.**
