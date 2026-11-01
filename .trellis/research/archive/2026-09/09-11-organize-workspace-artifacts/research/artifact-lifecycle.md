# Artifact lifecycle and recurrence inputs

## Query, scope, and method

- Date: 2026-09-11 (Asia/Shanghai), branch main at bc5c21ef.
- Query: identify who writes each concrete root/nested artifact, who reads it, what contract names its destination, and the smallest future change that prevents repeat clutter.
- Evidence: current package scripts/config/CI, bounded filesystem totals, task validation docs, and targeted FFF searches. No generator/build/test command was run and no source was changed.
- This is a lifecycle map, not a generic cleanup framework. A “no reader found” result is limited to the inspected repository/current scripts and does not prove that a user's external process has no handle.

## Producer/reader matrix

| Artifact or concentration | Producer / owner | Readers and contract | Current state | Minimal lifecycle input |
|---|---|---|---|---|
| mr3-windows-smoke-evidence.json | Historical mr3-smoke.cjs (removed by 30e0e545); added in 73cb29a2 | No current reader/producer found by FFF; archived MR3 progress task is the provenance | Tracked clean, 3,429 B; unique non-standard MR3_SMOKE_EVIDENCE snapshot | Move once to archived MR3 task research/evidence (or explicitly retain root); update any future references; never silently delete |
| simple-icons-16.20.0.tgz | No current producer; local download only | No package/source/Electron/script/site/docs reader; archived planning text says vendor only used SVG paths, not full package | Ignored only by .git/info/exclude; 3,451-entry CC0 package, 6,479,178 B | Delete after owner confirms no offline experiment, or move outside checkout to a named local downloads/cache directory; no tracked ignore-rule change needed |
| build/capability-probe-runtimes | scripts/ensure-capability-probe-runtime.mjs:16 and runtime preparation helpers | capabilities:probe (package.json:20) and capability probe scripts; metadata controls reuse/rebuild | 6,949 files, 83,710,089 B; ignored | Keep default under build; delete only when no probe process; next run rebuilds |
| build/capability-probe-review/review.json | scripts/generate-capability-probe-review.ts:20 | capabilities:probe:review (package.json:21), human review | 1 file, 11,228 B; ignored | Keep destination; overwrite/recreate per review, no root output |
| build/download-telemetry-report | scripts/generate-download-telemetry-report.ts:89-94 | telemetry:report (package.json:22); report.json/report.md/report.html | Not present in the measured child list, but default is explicit and ignored | Keep destination; allow --outputDir for callers needing an external report |
| build/manual-runtime-smoke/unicode-config-测试 | scripts/smoke-managed-python-downloaders.mjs:59-64 | runtime:smoke:downloaders (package.json:31); test output/config | 17,902 files, 219,301,712 B; ignored | Keep while smoke is running; document local delete/re-run, do not move into tracked evidence |
| build/macos-runtime-package-verification-<arch>.json | .github/workflows/release.yml:127-130 via tee | CI upload step lines 130-135; CI job artifact only | Local/CI generated report, ignored | Keep CI path; CI artifacts are uploaded under job storage and do not need root retention |
| Other build smoke/inspection dirs | Historical smoke/manual commands; current producer not found in package scripts/FFF scope | Historical task reports or no reader | The non-empty historical set listed in workspace-inventory totals 989,906,126 B; individual sizes remain authoritative because task references may overlap | Delete locally only after active-task reference check; do not add a new archival tree when task evidence already exists |
| dist | Vite build (package.json:28; vite.config.ts) | Electron builder files: dist/**/* (electron-builder.config.mjs:54-56); preview/dev | 3,007,024 B; ignored | Rebuild/delete when idle; never move into tracked source |
| dist-electron | electron:build (package.json:17) and preflight/dev scripts | Electron dev, smoke downloader, electron-builder dist-electron/**/* | 841,075 B; ignored | Rebuild/delete when idle; package scripts expect this exact path |
| dist-scripts | tsc -p tsconfig.scripts.json (package.json:20-22) | capability/telemetry commands invoke compiled scripts under dist-scripts | 79,661 B; ignored | Rebuild/delete when idle; retain path contract |
| dist-release/installer and portable outputs | electron-builder output configured at electron-builder.config.mjs:3, 51-53; package scripts | Release workflow uploads installer/portable ZIP; local package verification reads metadata | 5,075,044,507 B including portable mirror, ZIPs and 9 verification extractions | Keep current package output while validating; prune only stale verification/failed temp using package contract |
| dist-release/portable/Ameow_portable | scripts/package-portable.ps1:73-131 mirror refresh | Local portable launch/manual checks; portable-verification.json mirrorPath | 430,778,415 B; latest mirror | Protect until package validation and portable process exit |
| dist-release/portable/verification/Ameow_portable_verify_* | scripts/package-portable.ps1:134-153 creates a timestamped extraction each run | portable-verification.json:155-164 points to the newest extraction; validation docs use explicit paths | 9 dirs, 3,876,758,287 B; old 8 total 3,445,979,872 B | After successful extraction/metadata write, prune older successful dirs (retention count is a user decision); preserve latest referenced path |
| dist-release/win-unpacked.tmp | Failed/leftover Electron Builder output | No current source reader; identical to task-owned package-win-clean evidence | 75 files, 359,919,916 B; no current win-unpacked directory | Remove only after no builder process and P2-A/P2-V evidence gates are closed; retain task evidence, not both root copies |
| docs-screenshot-captures root PNGs | Historical real-Electron/extension capture pipeline (removed docs:screenshots command) | Docs/readme materials and human design review; no current source references found for names | 12 PNGs + README, dated 2026-05-29 | Decide whether docs still publish them; if retained, keep as named evidence; if obsolete, delete as a batch after docs link check |
| docs-screenshot-captures/lab | scripts/capture-lab-smoke.mjs:10-13, 57-84 via lab:capture (package.json:14) | Human/UI Lab review; output path can be overridden with --output | 5 PNGs, dated 2026-09-10; ignored | Keep while Lab work is active; delete/regenerate per capture; no root move needed |
| site/.astro, site/dist | site/package.json build command (Astro/Starlight); site/.gitignore | docs:build/docs:preview (package.json:23-25) and GitHub Pages deploy workflow | 872,241 B + 3,557,799 B generated; ignored | Keep source/package tracked; generated output can be deleted/rebuilt, and site/.gitignore already covers it |
| site preview logs | Astro dev/preview processes | No current reader; site/.gitignore log patterns | 4 files, 803 B | Delete when server is stopped; no code change |
| desktop-assets/binaries/python-* | scripts/python-runtime.mjs and ensure-python-runtime.mjs; CI preparation | electron-builder.config.mjs:31-35 packages selected target; runtime smoke/bootstrap reads them | 178,498,349 B across three ignored target directories (52,699,815 + 52,929,965 + 72,868,569); required package inputs | Preserve selected targets and manifest; remove only an unneeded platform after manifest/CI matrix confirms no consumer |
| desktop-assets/binaries/ytdlp-baseline | scripts/prepare-ytdlp-baseline.mjs | Packaged runtime and baseline verification scripts; explicitly unignored/tracked by .gitignore:50-52 | 3 tracked files, 3,239,284 B | Protect; license/hash manifest is part of package contract |
| .tmp-config | electron-runtime/service.test.ts:206 default configDir | Runtime service tests only; test creates isolated config | Empty at inventory time | Keep as disposable test output; test teardown/cleanup may remove it once no test process |
| Ameow_Received | electron/main.mts:197 default output-folder name and configStore tests | UI/native folder actions and docs mention the default name; users may put downloads here | Empty at inventory time | Protect name/behavior; remove empty directory only after checking for user files |
| node_modules and site/node_modules | npm install from lockfiles | All Node scripts/build/tests; not source artifacts | Traversal intentionally skipped | Reinstall/delete routine when idle; no project move |
| .trellis/.backup-* | Trellis update process; .trellis/.gitignore labels “Update backup directories” | No current references found; rollback convenience only | Five ignored dirs, 14,496,667 B total | User-owned local deletion after confirming no rollback need; already ignored, so no rule change |
| .trellis/.runtime and __pycache__ | Trellis/Codex hooks/runtime | Active session and Python tools | Small ignored runtime/cache files | Preserve during active session; delete after run/process exit |
| .trellis/tmp browser-extension package snapshot | Commit 3e2d2b56 tracked old package/extraction; no current producer | No current reference found; current scripts/package-browser-extension.mjs produce a fresh ZIP | 49 tracked files, 519,373 B total with logs; old snapshot includes removed picker/detectors | Candidate tracked cleanup after current package script/tests validate replacement; delete duplicate, keep Git history |
| .trellis/tasks archive evidence | Individual archived task producers and validation reports | Task validation/research docs cite exact evidence paths; active planning may consult them | 1.2+ GiB, with unique managed-runtime/package evidence | Protect unique evidence; any duplicate pruning requires reference update and owner sign-off |

The runtime total in the desktop-assets row is intentionally not collapsed into a guessed number: the measured target directories are 52,699,815 B (aarch64 Apple), 52,929,965 B (x86_64 Apple), and 72,868,569 B (x86_64 Windows), all ignored. The tracked baseline/manifest and icons are listed separately.

## Contracts that already keep output out of the root

1. Root .gitignore:10-18 excludes node_modules, dist, dist-electron, dist-scripts, dist-release, docs-screenshot-captures, and build; lines 48-52 keep prepared Python payloads local while preserving the manifest and ytdlp baseline.
2. electron-builder.config.mjs:3 and 51-63 pin the package output to dist-release and enumerate exactly what enters the package. Root MR3 evidence and simple-icons are not package inputs.
3. package.json:17, 20-22, 28-31 and 47-48 call the build/runtime/package writers that target the named ignored directories; none writes an unscoped root file.
4. scripts/package-portable.ps1:73-82, 118-164 owns portable mirror/ZIP/verification names and records the latest verificationPath. The missing retention step is the only large repeat-growth contract found.
5. scripts/capture-lab-smoke.mjs:13 defaults captures to docs-screenshot-captures/lab and cleans only its exact Vite port cache (lines 113-119). vite.lab.config.ts:45-49 ignores generated evidence/runtime roots; docs-screenshot-captures is deliberately an output, not a source input.
6. site/.gitignore covers site/dist, .astro, node_modules, and logs; CI release.yml uploads job artifacts from dist-release/build paths and assembles final artifacts under artifacts/, not repository root.

## Minimal recurrence-prevention design

### Phase A: low-risk local/retention policy (no source migration)

- Keep build/dist/dist-electron/dist-scripts and site generated paths where their current commands expect them. Delete only while no corresponding process is running.
- Delete or move simple-icons outside the checkout after the owner confirms no offline use. Leave .git/info/exclude as a local privacy/download rule; adding a project-wide ignore pattern is not needed.
- Remove the five Trellis .backup-* directories and stale .trellis/workspace ignored logs only after confirming no rollback/session is active. The existing .trellis/.gitignore already prevents recurrence.
- Remove old dist-release verification directories except the path named by portable-verification.json only after the latest package check succeeds. Keep the root failed win-unpacked.tmp decision separate because it overlaps task evidence.

### Phase B: tiny producer change for portable retention

The smallest implementation is in scripts/package-portable.ps1 immediately after successful freshExtractionRoot validation and metadata write: enumerate sibling verification directories under the exact verificationRoot, sort by LastWriteTime/name, and remove every directory except the one just written (or a user-selected small retention count). Do not prune before extraction succeeds; the existing catch already removes a failed new directory. Keep portable-verification.json pointing to the surviving path. This change should be accompanied by one focused script-level check that a successful second run removes only older snapshots and a failed expansion leaves the previous metadata/path untouched.

### Phase C: tracked historical artifact decision

- Move mr3-windows-smoke-evidence.json to .trellis/tasks/archive/2026-08/08-13-mr3-progress-field/research/evidence/ only if the owner accepts a tracked path change; update references (none found), then verify the archived task remains discoverable. Retaining root is the zero-risk alternative.
- Delete the tracked .trellis/tmp/browser-extension-package-check and extracted snapshot only after current scripts/package-browser-extension.mjs and existing package tests produce/inspect the modern package. Git history preserves the old beta ZIP; no duplicate task evidence needs to be created.

### Phase D: documentation and screenshot clarity (optional)

The screenshot README says npm run docs:screenshots, but archived MR9 validation confirms that command and capture-docs-screenshots.mjs were retired. A later docs-only change should either replace that line with npm run lab:capture (and explain the five Lab scenarios) or mark the 2026-05-29 root PNG set as historical. Do not delete screenshots solely because the README command is stale; first check any published docs links.

## Validation and rollback inputs for a future implementation

| Change | Required checks (not run during planning) | Rollback |
|---|---|---|
| Delete simple-icons | confirm no local owner; verify package.json/package-lock/source/scripts/site/docs still have zero references; restore archive from the original download if needed | keep a user backup outside repo before deletion |
| Move MR3 evidence | git diff --name-status; FFF search for old/new path; inspect archived task index/report | move file back; no history rewrite |
| Prune portable verification | run package:portable or package:portable:skip-build with no portable process; parse portable-verification.json and confirm verificationPath exists; compare ZIP hash; check latest mirror/ZIP | restore the removed timestamp directory from backup or rerun package script |
| Remove win-unpacked.tmp | ensure no electron-builder process; compare task evidence path remains readable; run package:win:dir later if needed | rerun package:win:dir; task evidence is retained |
| Remove .trellis backups | verify no active Trellis update/rollback; list current .trellis/spec/tasks/workspace afterward | restore from local backup only if rollback is requested |
| Remove tracked .trellis/tmp snapshot | run current package-browser-extension script and package tests; inspect ZIP manifest | recover from Git commit 3e2d2b56 |
| Screenshot cleanup/docs README | FFF all screenshot filenames and docs-screenshot-captures references; build docs if links changed | restore PNGs/README from Git or captured assets |

No CI, build, test, or generator command was run here, so these checks remain implementation acceptance criteria rather than claimed results.

## Not-found and uncertainty boundaries

- No live reader/producer was found for the exact MR3 evidence filename or simple-icons archive. Historical references were kept separate from live references.
- No current writer was found for most named build smoke/inspection children; their deletion remains a local owner decision, not an automatic rule.
- The investigation did not inspect machine-wide caches, follow external links, traverse node_modules/.git, or infer user-owned download/output data.
- No project-wide ignore update is justified by the evidence. Existing ignore rules already cover generated roots; .git/info/exclude is intentionally local.
