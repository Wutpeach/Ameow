# P2-B final independent check

Date: 2026-09-12. Active task: `.trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning`.
Orca task `task_72c7eece943d`, dispatch `ctx_634bc311e412`.

## Verdict

**PASS — implemented stage-only source acceptance. STOP — retained external release gates.**
The final focused suite passes **21 root files / 293 tests**, with no skipped tests or duplicate worktree counts. Type-check, configured lint, full renderer/Electron build, final Electron rebuild, baseline/managed source verification, compiled runtime imports, and package-layout fixtures pass. Both real packaged baseline wheels pass the replacement validator read-only. The production allowlist remains empty; no real release was approved or staged.

This supersedes the repair report's unsupported claims about archive ordering, native timeout settlement, installed-byte integrity, complete dependency identity, and baseline-compatible overlap. No activation, selection, rollback, GC, updater, UI, Repair Center, Report refactor, commit, branch, archive, or task-metadata operation was performed. Existing Report repair, unrelated agent definition, temporary trees, other task and Lead metadata were preserved.

## Findings fixed

### R1 / B / E — canonical contracts, archive proof, and real baseline compatibility

Removed the handwritten inflate-all ZIP reader. The canonical MJS validator now runs the **bundled Python** asynchronously and read-only, using stdlib `zipfile`/email plus that Python's existing pip-vendored `packaging` PEP 440/508 implementation. It streams members for CRC/local-header/bounds validation; rejects unsafe, duplicate/case-colliding paths, symlinks, encryption, ambiguous/mismatched metadata, wrong universal-wheel policy, unsupported active dependency authority/extras, missing dependencies and incompatible dependency versions. It evaluates base requirements and target markers with no extras requested, so real yt-dlp optional dependencies do not falsely reject the wheel. Expansion is bounded at 256 MiB and 20,000 members, parser execution at 30 seconds. All validator subprocesses settle before cleanup.

Size/hash and archive validation now finish **before** `runMutation`. Malformed archive tests explicitly assert no mutation and no materialization. Runtime derives release IDs through the shared implementation and validates the raw contract before adapting it. Baseline runtime/source/package verifiers reuse the shared generic contract while retaining baseline pin checks and their existing error ordering.

The real baseline exposed an actual field conflict: its `provenanceUrl` is PyPI metadata, while the previous managed schema treated that field as the wheel transport URL. The coordinator explicitly approved the bounded correction through Orca ask/reply:

- Keep baseline provenance, bytes, pins and identity exactly unchanged.
- Add optional package `downloadUrl`; metadata-provenance managed entries require an explicit exact approved HTTPS wheel URL.
- Include transport in managed release identity/acquisition; never derive or fetch metadata at runtime.
- Legacy file-provenance entries may use that exact declared file URL.
- Compare every common baseline overlap field, including provenance, bytes, policy, probe, minPython and targets; validate managed transport separately because baseline has no transport field.

Tests accept a nonempty contract built from the actual baseline manifest with fixture transport URLs, reject malicious/missing transport, and reject each overlap mismatch. These fixtures confer no release approval. `git diff --exit-code -- desktop-assets/binaries/ytdlp-baseline electron/managedPythonPackageManifest.mts` exits 0.

### R2 / C — immutable installed-byte and complete cache proof

The marker now records a required `materializationDigest` over sorted installed venv paths/content hashes, including Python, launcher, installed package files and bytecode. Cache validation compares it **before executing cached Python**, in addition to retained wheel hashes, marker/catalog/full package identity, installed versions and expected passed probe. Explicit tests modify the existing installed launcher, Python and package module while retaining clean wheels, assert quarantine, no cached subprocess, no download, and byte-identical marker.

Current mutation-local Python identity includes target/version/manifest digest/executable hash. Media identity includes approved version/artifact digest and observed executable hash. The catalog records hashes of these full identities, rather than treating observed executable hashes alone as full identity. Tests cover changes in Python bytes/version/target, FFmpeg artifact, FFprobe bytes and Deno version. Low-level composition tests remove the baseline directory entirely, verify full dependency facts, reject Python/media version mismatches, and prove no baseline materialization.

### R3 / A / F — bounded utilities and confirmed tree settlement

Both utility APIs share one captured implementation, bound output, default to a 60-second timeout for low-level callers, and retain explicit candidate bounds. The process-tree primitive lives beside the existing runner primitives; existing download runner execution/abort behavior is unchanged.

Windows uses the absolute native `System32/taskkill.exe /PID <pid> /T /F`, never ComSpec, and does not kill the root before asking Windows to terminate its tree. A timeout remains failure even after exit zero. Child close and successful tree termination are both required. Killer errors do not release ownership. Retry stops if the root exits without confirmed tree settlement, so a potentially reused PID is never retried. POSIX utility children own a detached process group; termination targets the group and waits until the group is absent.

Tests cover no-PID close settlement, PID-present handles, killer failure, root-before-descendant settlement, late exit zero, default timeout, no retry of exited PIDs, simulated POSIX group/descendant disappearance, and a **real Windows Node parent plus descendant with ignored stdio**. Both actual PIDs are absent when the helper rejects. Ambient Python/PIP/virtualenv injection is removed, user-site/safe-path/no-bytecode/no-index controls are asserted, and candidate probe arguments retain explicit app-owned Deno/FFmpeg paths and config/plugin/remote-component disabling.

**Necessary ownership limit:** if the OS refuses termination, finite wall-clock completion cannot be promised without violating the explicit no-release-while-live rule. The code retains ownership, retries only while the root remains owned, and stays unsettled if descendant identity becomes unknown. This is fail-closed behavior tested here, not a claim of successful termination on an uncooperative OS or closure of macOS release gates.

### R4 / D — actual observation DTO and safe persisted fields

Diagnostics imports the actual inspection DTO; renderer facts now allow absent eligibility and carry independent `consistent | marker_only | marker_mismatch` observation plus catalog observation errors. Marker-only observations have **no eligibility property**. Marker mismatch preserves the persisted lifecycle outcome instead of inventing quarantine. Consistency compares the full record/release identity.

Persisted digests are strict 64-hex values; identities/package sets are bounded/path-safe. Corrupt catalogs retain safe marker-only observations and their original bytes. Tests verify no fabricated lifecycle result, no placeholder eligibility in Diagnostics, and no synthetic path/credential leak.

### R5 / F — direct low-level production dependency composition

Removed the repair's synthetic `managed-ytdlp-probe-inputs` shared capability. Main now directly composes the existing low-level candidate input function inside the stage mutation, without baseline readiness/binding or shared capability preparation. The lower-level function checks bundled Python and app-owned FFmpeg/FFprobe/Deno identities. Bundled selection and attempt binding remain unchanged.

### R6 — bounded acquisition retained and verified

The repaired shared streaming maximum remains in place: Content-Length/chunk overflow rejects before oversized writes, with reader cancellation/settlement and cleanup. Root coverage verifies early stream cancellation, stage second-asset network/size/hash/redirect isolation, exact transport-only fetching and no mutation on byte/archive rejection. No latest, caller-URL, upstream discovery or runtime metadata fetch is introduced.

### R7 / E — enforced and executable packaging proof

The existing repaired package entrypoint's before/after managed verifier calls are retained. Package verification checks exact source resource content and loads the **actual compiled canonical module and Electron wrapper from the packaged app root**. Fixtures cover Windows x64, macOS x64 and macOS arm64; missing requested architecture, missing/corrupt/mismatched allowlist and missing compiled canonical module fail. A nonempty baseline-compatible fixture passes each layout. Source overlap tests exercise provenance, bytes, policy, probe, minPython and target equality.

### R8 / F — bounded authoritative failure categories

All public stage paths wrap failures in `ManagedYtDlpStageError` categories `approval | download | integrity | materialization`. Categories come from operation boundaries/typed integrity checks, never regex matching raw provider or subprocess text. Failed probe stdout is not persisted as a version. Synthetic sensitive strings and a forged “checksum mismatch” provider message are covered; the latter remains a bounded download failure.

### F1–F3 retained

Safe release/path IDs, preservation of corrupt/unsupported catalog bytes, and raced invalid-marker directory protection remain tested. Immutable marker-last commit, per-asset cleanup/isolation, failed eligibility retaining committed state, idempotency, same-version/different-bytes identity and lifecycle lease behavior remain covered.

## Original 16 failure behaviors — root coverage audit

The earlier task-local reproductions had already been removed before this dispatch. Their historical failures remain recorded in `check-report.md` / `check-regressions.log`; this review does not claim to rerun removed files or recreate the old implementation. The behaviors are represented in canonical root tests:

| Prior failure behaviors | Root assertion coverage |
| --- | --- |
| 1–4: duplicate, credential provenance, invalid minPython, traversal build contracts | managed release strict-policy table and shared source contract tests |
| 5: mismatched wheel filename/tag/name before network | invalid approved wheel test, adversarial metadata/ZIP tests |
| 6: missing entrypoint; 7: changed Deno; 8: incomplete/full-identity cache proof | existing cache tests plus installed-byte and complete dependency tables |
| 9: every child bounded/isolated; 10: FFmpeg probe binding | stage subprocess call assertions, real environment/default-timeout tests |
| 11: timeout/process settlement | both utility APIs, PID-present failure/descendant tests and real process-tree test |
| 12: marker-only omission; 13: fabricated lifecycle quarantine | exact optional eligibility and persisted-observation separation assertions |
| 14: raw persisted probe/digest privacy | corrupt proof and raw failed-probe/provider-string tests |
| 15: production prepares bundled yt-dlp | actual main function composition plus low-level preparation tests with baseline absent |
| 16: streaming consumes beyond approved size | shared real Response-stream early-cancellation assertion |

The unsafe prior “unowned handle can settle on timeout” test was replaced with the explicitly required contract: no child-close evidence means no ownership release. No assertion was weakened to claim that a live child had settled.

## Ten user criteria

| Criterion | Verdict / evidence |
| --- | --- |
| 1. App-approved explicit release only | PASS: strict shared manifest/transport, releaseId-only command, empty production allowlist |
| 2. Verify failure cannot create a valid-looking candidate | PASS: all bytes/ZIP/metadata before mutation, cleanup/no-marker assertions |
| 3. Immutable identity/commit/idempotency | PASS: marker-last, race protection, cache skip-download, distinct content IDs |
| 4. Persisted structured eligibility | PASS: passed/failed/quarantined facts, strict proof parsing and bounded errors |
| 5. Cache integrity revalidation | PASS: installed bytes before execution plus full current dependency/catalog proof |
| 6. Per-asset failure isolation | PASS: all second-asset failures, corrupt catalog preservation, low-level composition |
| 7. Bundled effective/binding unchanged | PASS source boundary and existing binding/attempt regressions; no managed selection path |
| 8. P2-A leases/pinning/readiness retained | PASS: busy/arriving-lease tests and confirmed timed-out process ownership |
| 9. Passive Diagnostics | PASS: marker-only optional eligibility, independent observation, sanitized read-only facts |
| 10. Required checks/honest gates | PASS source checks below; STOP external platform/live-release gates |

## Exact verification

Commands ran from `D:\Ameow`. Logs are task-local `final-*.log`; configured lint is `eslint src vite.config.ts --ext .ts,.tsx`, not an Electron-wide lint claim.

```powershell
npx vitest run electron/managedYtDlpRelease.test.mts electron/managedYtDlpReleaseCommands.test.mts electron/managedRuntimeBootstrapProcess.test.mts electron/ytDlpBaseline.test.mts electron/runtimeSetLifecycle.test.mts electron/managedRuntimeBootstrap.test.mts electron/diagnostics.test.mts electron/diagnosticsCommands.test.mts electron/errorDiagnosticCopy.test.mts electron/errorDiagnosticCommands.test.mts electron/supportLogExport.test.mts electron/runtimeDependencyGate.test.mts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/processRunner.test.ts src/electron-runtime/processRunner.credentials.test.ts src/electron-runtime/runtimePaths.test.ts scripts/managed-ytdlp-package-set.test.mts scripts/verify-ytdlp-managed-release-package.test.mts scripts/verify-ytdlp-baseline-package.test.mts --exclude '.trellis/**' --exclude '.cindy-worktrees/**' > .trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning/final-focused.log 2>&1
# PASS: 21 files / 293 tests, no skips; final-focused.log.

npm run type-check
# PASS: final-types.log.
npm run lint
# PASS: final-lint.log.
npm run build
# PASS: renderer and Electron, final-build.log (existing large-chunk advisory).
npm run electron:build
# PASS after the last Electron changes: final-electron-build.log.

npm run runtime:verify:ytdlp-baseline
# PASS: final-baseline-verifier.log.
npm run runtime:verify:ytdlp-managed-release
# PASS: zero releases, final-managed-verifier.log.

node --input-type=module -e 'import {readFileSync} from "node:fs"; import {validateYtDlpWheelArchive} from "./dist-electron/scripts/managed-ytdlp-package-set.mjs"; import {inspectManagedYtDlpCandidates} from "./dist-electron/electron/managedYtDlpRelease.mjs"; import {verifyBundledYtDlpBaseline} from "./dist-electron/electron/ytDlpBaseline.mjs"; const root="desktop-assets/binaries/ytdlp-baseline"; const m=JSON.parse(readFileSync(root+"/.official-ytdlp-baseline.json")); for(const p of m.packages){await validateYtDlpWheelArchive(readFileSync(root+"/"+p.filename),p,m.packages); console.log(p.filename+" PASS");} await verifyBundledYtDlpBaseline({baselineRoot:root,platform:process.platform,arch:process.arch}); const value=await inspectManagedYtDlpCandidates({configDir:".trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning/absent-inspection-only",platform:process.platform,arch:process.arch,managedManifestPath:"desktop-assets/binaries/ytdlp-managed-releases.json"}); if(value.selection!=="bundled"||value.candidates.length)throw Error("inspection contract"); console.log("Compiled candidate/baseline modules and read-only inspection PASS");' > .trellis/tasks/08-26-managed-ytdlp-p2b-release-stage-only-planning/final-built-runtime.log 2>&1
# PASS: two real wheels plus compiled candidate/baseline modules and passive inspection.
# Test-Path of absent-inspection-only returned False.

git diff --check -- electron scripts src .trellis/spec/backend/electron-runtime-contracts/04-electron-download-command-bridge-contract.md .trellis/spec/backend/electron-runtime-contracts/07-electron-managed-runtime-bootstrap-module-contract.md
# PASS: final-diff.log.
git diff --exit-code -- desktop-assets/binaries/ytdlp-baseline electron/managedPythonPackageManifest.mts
# PASS: baseline content/pins untouched.
```

Package verifier fixtures are part of the 293 tests and invoke the actual Node scripts. Earlier `final-*-initial.log` / `final-repair-*.log` preserve intermediate failures and repairs, not final PASS evidence. No real packaged-app clean-host or live EJS claim is made.

## Findings not fixed / external gates

No known implementable in-scope acceptance finding remains open. OS-refused termination deliberately retains ownership as described above; POSIX group logic is simulated in this Windows run, not native macOS proof.

The retained external gates remain open: clean-host Windows Electron Builder/default-userData, portable replacement retention, successful live EJS challenge, macOS arm64 fresh quarantine/offline baseline/Gatekeeper, and explicit approval/provenance review for any real nonempty allowlist. Deterministic transport URLs and real baseline read-only validation do not authorize staging a release.

## Review-owned files

- Runtime/DTO: `electron/managedYtDlpRelease.mts`, `electron/managedRuntimeBootstrap.mts`, `electron/ytDlpPackageSet.mts`, `electron/ytDlpBaseline.mts`, `electron/main.mts`, `electron/diagnostics.mts`, `src/types/diagnostics.ts`, `src/electron-runtime/processRunner.ts`.
- Root tests: `electron/managedYtDlpRelease.test.mts`, `electron/managedRuntimeBootstrapProcess.test.mts`, `electron/ytDlpBaseline.test.mts`, `electron/diagnostics.test.mts`, `scripts/managed-ytdlp-package-set.test.mts`, `scripts/verify-ytdlp-managed-release-package.test.mts`.
- Canonical/tooling: `scripts/managed-ytdlp-package-set.mjs`, its `.d.mts`, `prepare-ytdlp-managed-release.mjs`, `verify-ytdlp-managed-release.mjs`, `verify-ytdlp-managed-release-package.mjs`, `prepare-ytdlp-baseline.mjs`, `verify-ytdlp-baseline-package.mjs`.
- Existing spec leaves 04/07 were synchronized using `trellis-update-spec`; no historical Rust-doc cleanup or roadmap.
- This report and task-local `final-*.log` evidence.

Preserved previous implementation/repair files not listed above, Report-repair changes, all existing reports, unrelated agent/tmp/task changes, and Lead planning/task artifacts. No commits, branches, archives or worker dispatches were created.

