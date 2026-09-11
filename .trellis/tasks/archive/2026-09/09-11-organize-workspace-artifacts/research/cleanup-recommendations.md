# Cleanup recommendations (planning only)

## Query, scope, and boundary

- Date: 2026-09-11 (Asia/Shanghai); branch main at bc5c21ef.
- Goal: give the Lead an implementation-sized, evidence-backed candidate list for root clarity, local disk recovery, and tracked repository bloat.
- No files outside this research directory were deleted, moved, or edited. No build/test/package/generator command was run.
- Exact observed sizes below are independent candidates; do not add them together unless overlap is explicitly ruled out. In particular, task evidence and dist-release copies can describe the same package attempt.
- No Git-history rewrite is proposed. Historical evidence is preserved unless an explicit owner decision says otherwise.

## Ranked candidates

### 1. Prune old portable verification extractions (local disk recovery)

- Exact target: dist-release/portable/verification/Ameow_portable_verify_20260602_112831, 20260603_183601, 20260604_135232, 20260604_142231, 20260604_172829, 20260604_234317, 20260605_113218, and 20260617_190425.
- Evidence: nine timestamped directories total 3,876,758,287 B; the eight older directories total exactly 3,445,979,872 B (3.21 GiB decimal). portable-verification.json points to the latest 20260716_173406/Ameow_portable path.
- Producer/reader contract: scripts/package-portable.ps1:134-164 creates one timestamped extraction per successful run and records only the newest verificationPath; no current source reader needs older timestamps. Historical task docs say to use the explicit path from portable-verification.json.
- Recommendation: after confirming no portable app/builder process is running and the latest extraction validates, remove only the eight old directories. Keep the latest extraction, portable mirror, ZIP, extension ZIP, and metadata.
- Recurrence fix: add a small post-success prune in scripts/package-portable.ps1 that keeps the newly written directory (or an owner-selected retention count). Never prune before expansion and metadata write succeed.
- Tradeoff: keeping all snapshots supports historical comparison; pruning returns 3.45 GB and leaves the documented latest contract. User decides retention count.
- Validation: run package:portable:skip-build against a known-good unpacked package, parse portable-verification.json, assert verificationPath exists, compare ZIP hash, and confirm an older test directory is removed only after success. Rollback is rerunning the package or restoring an external backup.

### 2. Remove root dist-release/win-unpacked.tmp after failed package gate closes (local disk recovery)

- Exact target: dist-release/win-unpacked.tmp, 75 files / 359,919,916 B. No current dist-release/win-unpacked directory exists.
- Evidence: bounded compare found byte-for-byte equality across all 75 files with .trellis/tasks/archive/2026-08/08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning/evidence/package-win-clean/win-unpacked.tmp. The P2-A and P2-V validation records describe these as incomplete Electron Builder output after external EPERM.
- Recommendation: delete only the root copy once no electron-builder process is running and P2-A/P2-V package gates no longer need a convenient root path. Keep the task-owned evidence copy and its validation narratives.
- No source change is needed; electron-builder will recreate the output on package:win:dir. The root copy is a disk duplicate, not tracked repository bloat.
- Validation/rollback: verify the task evidence directory remains readable, then run package:win:dir in a later implementation check if packaging is needed; rerun recreates the root output.

### 3. Delete stale build smoke/inspection children (local disk recovery, owner-gated)

Exact observed children and sizes are listed so a user can select a bounded batch:

| Candidate | Files / bytes | Why stale / guard |
|---|---:|---|
| build/external-download-smoke | 8,265 / 315,127,870 B | No current producer found; historical downloader evidence. Check active diagnostics tasks first. |
| build/python-runtime-manual | 8,221 / 169,277,156 B | No current producer found; historical manual runtime evidence. |
| build/installer-inspect-final | 10 / 119,895,329 B | Historical installer inspection; no current writer found. |
| build/installer-inspect-full | 10 / 119,895,149 B | Historical installer inspection; no current writer found. |
| build/local-downloader-smoke-explore | 6,952 / 83,779,434 B | Historical exploration; no current writer found. |
| build/douyin-site-session-default-check | 4,121 / 52,107,236 B | Historical smoke output; no current writer found. |
| build/douyin-site-session-redaction-check | 4,121 / 52,110,955 B | Historical smoke output; no current writer found. |
| build/douyin-site-session-smoke | 4,120 / 52,089,849 B | Historical smoke output; no current writer found. |
| build/python-runtime-inspect | 1 / 25,593,816 B | Runtime inspection artifact; retain if an active task cites it. |
| build/github-artifacts | 6 / 25,637 B | Old downloaded CI artifacts; no current local reader found. |
| build/macos-package-verify-fixture | 4 / 3,691 B | Fixture; no current writer found. |
| build/cp-test-src and build/cp-test-dst | 1 / 2 B each | Old copy fixtures; no current writer found. |
| build/installer-inspect and build/nsis-upgrade-smoke | empty | Empty historical fixtures. |

Do not claim a combined reclaim total: the children have different historical owners and may overlap with task evidence. Keep build/capability-probe-runtimes (83,710,089 B), capability-probe-review (11,228 B), and manual-runtime-smoke (219,301,712 B) while their current commands run; these are the active default destinations. Also keep any build/macos-runtime-package-verification-<arch>.json produced by a current CI/local verification until its report is uploaded or copied.

### 4. Remove Trellis update backups when rollback is no longer wanted (local disk recovery)

- Exact targets: five ignored .trellis/.backup-* directories dated 2026-07-30 (two), 2026-08-12, 2026-08-24, and 2026-09-04.
- Observed total: 14,496,667 B (13.83 MiB); individual sizes are in workspace-inventory.md.
- Evidence: .trellis/.gitignore describes .backup-* as update backups; no current repository reference was found.
- Recommendation: user-confirmed local deletion after no Trellis update/rollback is active. No ignore change is needed because the existing pattern already prevents recurrence.
- Rollback: these are local convenience copies; preserve an external backup only if rollback is required. Current .trellis/spec, tasks, agents, and workflow files are not targets.

### 5. Remove the tracked old browser-extension package snapshot (tracked repository bloat)

- Exact target: .trellis/tmp/browser-extension-package-check/FlowSelect_0.4.0-beta.8_browser_extension.zip (115,208 B) and .trellis/tmp/browser-extension-package-check-extracted/browser-extension (48 files, about 402,984 B). The whole .trellis/tmp is 53 files / 519,373 B, including four ignored logs totaling 1,181 B.
- Evidence: all 49 ZIP/extracted files are tracked from commit 3e2d2b56; no current reference to the directory/ZIP was found. The extracted snapshot contains picker/detector files removed from current browser-extension source.
- Recommendation: delete the tracked snapshot in a later cleanup commit; do not move it into another task because Git history already preserves its provenance and current scripts/package-browser-extension.mjs produce a fresh package.
- Validation: run the current package-browser-extension script and its existing package tests, inspect the generated ZIP manifest, and ensure no task report links the old path. Rollback is git restore of the commit path (no history rewrite).
- Tradeoff: losing an easy local beta ZIP versus removing tracked duplicate/test residue. User may retain it if historical package reproduction is a requirement.

### 6. Delete or move simple-icons-16.20.0.tgz (root clarity and small local disk recovery)

- Exact target: root simple-icons-16.20.0.tgz, 6,479,178 B; ignored only by .git/info/exclude (not .gitignore), with no Git status entry.
- Evidence: tar listing has 3,451 complete package entries, LICENSE.md/README.md/DISCLAIMER.md, package version 16.20.0, and CC0-1.0 metadata. Current package.json/package-lock/source/Electron/scripts/site/docs have no consumer or producer; archived planning text explicitly rejects depending on the full package and recommends vendoring only used SVGs.
- Recommendation: default is delete after the owner confirms no offline/vendor experiment. If needed, move outside the checkout to a clearly named local downloads/cache directory; do not add a project-wide ignore rule solely for this file.
- Validation: FFF search simple-icons after the decision, inspect package manifests (no dependency), and check that electron-builder.config.mjs does not include it (it does not). Rollback is re-download from the package registry or restore the external copy; there is no tracked history to recover.

### 7. Relocate MR3 smoke evidence to its archived task (root clarity; tracked path change)

- Exact target: root mr3-windows-smoke-evidence.json, tracked clean, 3,429 B.
- Evidence: non-standard MR3_SMOKE_EVIDENCE snapshot with 11 scenarios and draw/arc/rAF/pixel counters; added in 73cb29a2. Its mr3-smoke.cjs producer was removed by 30e0e545. No current reader/producer found; the current task PRD is the only live filename reference.
- Recommendation: preferred destination .trellis/tasks/archive/2026-08/08-13-mr3-progress-field/research/evidence/mr3-windows-smoke-evidence.json, then update references (none currently found) and add it to the archived task's discoverable evidence list. Retaining root is the zero-risk alternative if preserving the historical filename is more important. Do not delete.
- Validation/rollback: git diff --name-status, FFF search old/new paths, and inspect the archived task index/report; moving back is a normal file move, with no Git-history rewrite.

### 8. Decide on old root screenshot captures and stale README wording (root clarity; optional)

- Exact observed set: docs-screenshot-captures has 18 files / 1,989,884 B: 12 root PNGs plus README (root files total 1,931,458 B) dated 2026-05-29, and 5 Lab PNGs totaling 58,426 B dated 2026-09-10.
- Evidence: README documents a removed npm run docs:screenshots command; archived MR9 validation confirms capture-docs-screenshots.mjs/docs:screenshots were retired. Current scripts/capture-lab-smoke.mjs (package.json lab:capture) writes the five Lab scenarios to docs-screenshot-captures/lab by default.
- Recommendation: preserve Lab captures while UI work uses them. For the older root PNG set, first FFF-search all filenames and docs links; then either retain as explicitly historical docs assets, move to a named docs evidence directory if an existing docs contract requires it, or delete the obsolete batch. Do not change source architecture or move assets for appearance alone.
- Minimal docs implementation, if selected: update the README command to lab:capture and label old captures historical, or remove the README/PNGs together after published docs are checked. Validation is docs build/link checking; rollback restores the ignored capture files from a user backup or recapture.

### 9. Remove generated site/build directories and test config only when idle (routine local cleanup)

- site/.astro (7 files / 872,241 B), site/dist (139 / 3,557,799 B), and four site preview logs (803 B) are covered by site/.gitignore and rebuild via docs:build/docs:preview. site/node_modules was skipped.
- dist (3,007,024 B), dist-electron (841,075 B), and dist-scripts (79,661 B) are covered by root .gitignore and recreated by build:renderer, electron:build, and tsc -p tsconfig.scripts.json. They are consumed by dev/package commands while running.
- .tmp-config was empty at inventory time and is the service-test default configDir (service.test.ts:206); Ameow_Received was empty but is the application’s default user output-folder name.
- Recommendation: local delete only after stopping relevant processes and confirming no user files. No move or source change; commands recreate exact paths. Never delete the Ameow_Received name from code/config tests.

## Protected paths and non-candidates

Protect these regardless of age/ignored status:

- .trellis/tasks active directories and archived evidence cited by validation/research, especially managed-ytdlp runtime/userdata/manifests and package evidence.
- .trellis/spec, .trellis/workspace tracked journals/indexes, .trellis/agents, .agents, .codex, .github, AGENTS.md, and project configuration.
- src, electron, browser-extension, scripts, site source/package/lock, docs, README/release-notes, locales, public, distribution, and all TypeScript/Vite/package configs.
- desktop-assets/binaries selected by scripts/python-runtime.mjs and electron-builder.config.mjs, tracked ytdlp-baseline, .official-python-runtimes.json, and desktop icon sources; these are package/runtime inputs.
- app-icon.png, background.png, desktop-assets/icons, LICENSE, and THIRD_PARTY_NOTICES.md.
- latest dist-release portable mirror, current ZIPs, portable-verification.json, and the latest verificationPath until package/manual validation is complete.
- .cookies.json contents and any user data under Ameow_Received; privacy and user-owned files are outside cleanup authority.
- node_modules/.git and reparse/link-bearing .claude paths were not traversed and are not candidates for an automated repository cleanup.

## Execution phases and acceptance evidence

1. **Owner decision gate (no code):** choose simple-icons delete/move, MR3 root-vs-archive retention, screenshot retention, Trellis backup deletion, old build-child batch, and portable verification retention count. Record selected paths; leave protected/uncertain paths untouched.
2. **Local disk phase:** stop Electron Builder/portable/runtime/Lab processes; remove selected old verification dirs, failed root temp, stale build children, backups, generated site/dist trees, and empty test output directories. Record before/after path lists and exact bytes removed per path; do not report unmeasured savings.
3. **Small producer phase:** update only scripts/package-portable.ps1 for post-success verification pruning, preserving failure behavior and portable-verification.json. Add one focused script check or equivalent documented manual check; no generic cleanup command.
4. **Tracked artifact phase:** move MR3 evidence if chosen; remove tracked .trellis/tmp duplicate if chosen; update only references proven by FFF/search. Keep the change reviewable and reversible.
5. **Docs phase (optional):** reconcile screenshot README with lab:capture or explicitly mark the old set historical, then run docs build/link checks.

Required checks after implementation (not run during this planning pass):

- npm run type-check, npm run lint, and npm test for tracked-path/script changes.
- npm run build:renderer, npm run electron:build, and a package:win:dir/package:portable:skip-build smoke as relevant to output cleanup.
- npm run docs:build when site/README or screenshot links change.
- For portable pruning, verify successful second run removes only older snapshots, failed expansion leaves prior metadata/path, ZIP hash is unchanged for the retained artifact, and no running portable process is touched.
- For MR3/.trellis/tmp changes, FFF-search old paths and inspect archive/package manifests.

## Tradeoffs requiring the user

| Decision | Keep | Clean/move | Cost |
|---|---|---|---|
| Portable verification snapshots | Historical comparison of nine extractions | Keep latest only; recover 3,445,979,872 B | Older comparisons require rerunning/backup |
| Root win-unpacked.tmp | Convenient failed-package inspection | Delete duplicate; recover 359,919,916 B | Must use task evidence or rerun package |
| Trellis backups | Quick local rollback | Delete five; recover 14,496,667 B | Rollback needs an external backup |
| simple-icons tar | Offline icon experiment | Delete/move 6,479,178 B | Re-download if a future experiment needs it |
| MR3 evidence root path | Zero path migration | Archive under MR3 task | Existing external links, if any, need updates |
| Tracked old extension ZIP | Easy beta fixture | Delete 518,192 B tracked snapshot (plus 1,181 B ignored logs if selected) | Recreate with current package script; old exact fixture is no longer present locally |
| Root screenshots | Existing docs/design references | Retain Lab only or delete old batch | Historical visual comparisons may be lost |

## Caveats

- Exact totals are checkout observations at inventory time; writing these reports adds files under the active task, so later .trellis totals will be larger by report bytes.
- No machine-wide disk survey, dependency traversal, build/test run, or external process inspection was performed.
- Ignored/untracked status and age were never used as deletion proof. Every candidate above has a producer/reader or duplicate-evidence rationale and an owner gate.
