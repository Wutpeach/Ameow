# Ameow workspace inventory

## Query, scope, and method

- Query: inventory the repository root and the non-source artifact/output concentrations that can make a local Ameow checkout hard to navigate or expensive to keep.
- Date: 2026-09-11 (Asia/Shanghai); baseline branch main at bc5c21ef. The only pre-existing worktree change was the untracked active task directory.
- Method: one bounded immediate-root listing including hidden entries; git status --short --ignored --untracked-files=normal; git ls-files/check-ignore; exact byte/file counts for named output directories; targeted FFF searches for producer/consumer identifiers. Reparse points and dependency/Git trees were not followed.
- Current listing has 56 immediate root entries (the earlier task note said 51; the live listing is the factual count). All 56 are represented below.
- Sizes are observed bytes on this checkout, not allocation size or a promise of reclaimable disk space. Directory totals include generated/ignored content when stated; tracked-byte totals are shown separately where useful.

Status labels: tracked means at least one path is in Git; ignored means excluded by .gitignore or .git/info/exclude; mixed means tracked paths plus ignored/untracked children; untracked/unknown means no tracked root path and no root-level ignore match. Git metadata is neither an application artifact nor a deletion candidate.

## Immediate root entries

| Entry | Git status | Observed size | Purpose / evidence | Recommendation |
|---|---|---:|---|---|
| .agents | tracked | 148 files, 1,292,199 B tracked | Project Trellis skills and workflow helpers. | protect; tool-mandated |
| .claude | ignored | not summed (contains reparse/link entries) | Local Claude skill overlay; ignored by root rules. | protect while tooling is used; do not traverse links |
| .codex | mixed | 8 tracked files, 90,033 B; ignored Python caches | Project Codex config, hooks, and Trellis agent definitions. | protect; caches are disposable only when no hook runs |
| .cookies.json | ignored via .git/info/exclude | 7,937 B | Local cookie material; no contents were copied into this report. | protect privacy; deletion is user-owned |
| .git | repository metadata | skipped | Object/index/refs; not an application artifact. | protect; no history rewrite |
| .gitattributes | tracked | 530 B | Git attributes contract. | retain |
| .github | tracked | 4 files, 11,921 B tracked | Pull-request template and deploy/release/verification CI. | protect |
| .gitignore | tracked | 803 B | Ignore rules for generated output, secrets, runtimes, and caches. | protect; only minimal rule changes after recurrence evidence |
| .impeccable | tracked | design.json, 14,162 B | UI/design-tool configuration. | protect |
| .tmp-config | untracked/unknown | empty (0 files observed) | Runtime service tests default configDir to cwd/.tmp-config (service.test.ts:206). | local delete candidate after tests/processes stop; test recreates it |
| .trellis | mixed | 19,298 files, 1,224,906,614 B observed at the inventory pass (before these reports); 11,425 tracked files, 392,293,265 B tracked | Specs, active/archive tasks, workflow state, runtime/backups, and evidence. | protect active tasks/specs; consider only named backup/tmp candidates |
| AGENTS.md | tracked | 6,972 B | Project operating instructions and cleanup boundary. | protect |
| Ameow_Received | untracked/unknown | empty (0 files observed) | Default output-folder name from electron/main.mts:197; tests assert the name. | protect behavior; remove empty local directory only if no user files |
| app-icon.png | tracked | 266,360 B | Electron packaging asset listed by electron-builder.config.mjs:60. | protect |
| background.png | tracked | 176,002 B | macOS/open-source DMG packaging artwork used by packaging scripts/workflow. | protect |
| browser-extension | tracked | 119 files, 1,200,217 B tracked | Browser extension source and package input. | protect |
| build | ignored (.gitignore:18) | 60,688 files, 1,292,930,123 B | Smoke/probe/inspection output. Current writers include capability and managed-runtime scripts; many children are historical. | retain active writer roots; local cleanup of stale children |
| DESIGN.md | tracked | 13,769 B | Product/design guidance. | retain |
| desktop-assets | mixed | 182,769,728 B observed; 13 tracked files/4,271,379 B tracked | Icons plus prepared Python runtimes and tracked yt-dlp baseline consumed by packaging. | protect package inputs; delete/move only unused target runtime with manifest checks |
| dist | ignored (.gitignore:12) | 3,007,024 B | Vite renderer output from npm run build:renderer. | disposable/rebuild when no process uses it |
| dist-electron | ignored (.gitignore:13) | 841,075 B | TypeScript Electron output from npm run electron:build and required by dev/package smoke commands. | disposable/rebuild when idle |
| dist-release | ignored (.gitignore:15) | 37,932 files, 5,075,044,507 B | Electron installers, portable mirror/ZIP, and verification extractions. | preserve current package contract; prune stale verification and failed temp only after checks |
| dist-scripts | ignored (.gitignore:14) | 79,661 B | Compiled capability/telemetry script output. | disposable/rebuild when idle |
| distribution | tracked | macos/install-guide.txt, 703 B | Distribution instructions. | retain |
| docs | tracked | 9 files, 2,838,298 B tracked | Engineering/readme docs and static documentation assets. | protect |
| docs-screenshot-captures | ignored (.gitignore:17) | 18 files, 1,989,884 B | 12 older root PNGs plus README and 5 current Lab PNGs; generated visual evidence. | preserve while docs/UI work needs them; delete/regenerate only with owner confirmation |
| electron | tracked | 106 files, 817,318 B tracked | Electron main/preload/runtime source and tests. | protect |
| electron-builder.config.mjs | tracked | 2,434 B | Defines dist-release output and exact packaged inputs (renderer, Electron, locales, runtimes, icons). | protect |
| eslint.config.js | tracked | 848 B | Lint configuration. | retain |
| index.html | tracked | 369 B | Production Vite entry. | retain |
| lab.html | tracked | 332 B | Browser Presentation Lab entry. | retain |
| LICENSE | tracked | 1,086 B | Project license. | protect |
| locales | tracked | 9 files, 63,159 B tracked | Application translations packaged by builder. | protect |
| mr3-windows-smoke-evidence.json | tracked, clean | 3,429 B | Unique MR3 presentation smoke snapshot (11 scenarios, canvas draw/arc/rAF counters, dimensions/pixels/title); no current reader/producer found. | move candidate to archived MR3 task evidence, or explicitly retain at root; do not delete without retention decision |
| node_modules | ignored | skipped (dependency tree) | Installed root dependencies; regenerated from package-lock.json. | retain only when working; local reinstall/delete is routine |
| package-lock.json | tracked | 275,435 B | Locked dependency graph for root scripts/build/tests. | protect |
| package.json | tracked | 4,155 B | Scripts and dependency contract; no simple-icons or MR3 artifact dependency. | protect |
| postcss.config.js | tracked | 74 B | Renderer CSS build configuration. | retain |
| PRODUCT.md | tracked | 1,248 B | Product requirements/context. | retain |
| public | tracked | 1 file, 1,497 B tracked | Static Vite asset (vite.svg). | retain |
| README.en.md | tracked | 4,615 B | English project documentation. | retain |
| README.md | tracked | 4,459 B | Primary project documentation. | retain |
| release-notes | tracked | 20 files, 33,949 B tracked | Release history/notes. | retain |
| scripts | tracked | 30 files, 150,771 B tracked | Build, runtime, smoke, packaging, and report producers. | protect; recurrence fixes belong here |
| simple-icons-16.20.0.tgz | ignored only by .git/info/exclude | 6,479,178 B | Complete simple-icons 16.20.0 archive (3,451 entries, CC0-1.0); no live package/source/docs consumer found. | delete candidate after user confirms no offline/vendor use; otherwise move to an explicitly local downloads/cache path |
| site | mixed | 67 tracked files/526,580 B; site/.astro 7 files/872,241 B; site/dist 139 files/3,557,799 B; 4 logs/803 B; site/node_modules skipped | Astro/Starlight docs source plus generated site output and dependencies. | protect source/package; generated .astro/dist/logs disposable when idle |
| skills-lock.json | tracked | 3,959 B | Skill/version lock. | protect |
| src | tracked | 372 files, 4,634,492 B tracked | Product renderer/domain source. | protect; source architecture is out of cleanup scope |
| tailwind.config.js | tracked | 193 B | Renderer styling configuration. | retain |
| THIRD_PARTY_NOTICES.md | tracked | 15,038 B | Third-party license/notice record. | protect |
| tsconfig.electron.json | tracked | 392 B | Electron TypeScript project config. | retain |
| tsconfig.json | tracked | 669 B | Renderer TypeScript project config. | retain |
| tsconfig.node.json | tracked | 223 B | Node/Vite TypeScript project config. | retain |
| tsconfig.scripts.json | tracked | 937 B | Script compilation config producing dist-scripts. | retain |
| vite.config.ts | tracked | 1,244 B | Production Vite build/test/dev config. | protect |
| vite.lab.config.ts | tracked | 1,967 B | Dedicated Lab server/build config; ignores build/dist-release/.trellis and other evidence roots, but not docs-screenshot-captures. | protect; capture output remains a separate decision |

Tracked files are clean except the active task directory, which is intentionally untracked. Root-level ignored entries are not automatically safe to remove: build, dist-release, desktop-assets/binaries, and screenshot captures have active or recent producers.

## Bounded nested artifact findings

### build (ignored, 1,292,930,123 B / 60,688 files)

The following child totals were measured without traversing node_modules or .git. “Historical/no writer found” means targeted FFF searches and current package scripts found no current producer; it is not proof that a running external process has no handle.

| Child | Files / bytes | Current contract and disposition |
|---|---:|---|
| capability-probe-review | 1 / 11,228 B | scripts/generate-capability-probe-review.ts:20 writes review.json; retain while reviewing probes |
| capability-probe-runtimes | 6,949 / 83,710,089 B | scripts/ensure-capability-probe-runtime.mjs:16; current default runtime cache; retain while probe work runs |
| cp-test-dst, cp-test-src | 1 / 2 B each | Old copy fixtures; no current writer found; delete candidates after no test process |
| douyin-site-session-default-check | 4,121 / 52,107,236 B | Historical smoke output; no current writer found; local delete candidate |
| douyin-site-session-redaction-check | 4,121 / 52,110,955 B | Historical smoke output; no current writer found; local delete candidate |
| douyin-site-session-smoke | 4,120 / 52,089,849 B | Historical smoke output; no current writer found; local delete candidate |
| external-download-smoke | 8,265 / 315,127,870 B | Historical downloader evidence; no current writer found; delete only after confirming no investigation depends on it |
| github-artifacts | 6 / 25,637 B | Old downloaded CI artifacts; no current local reader found; delete candidate |
| installer-inspect | empty | Old fixture; delete candidate |
| installer-inspect-final | 10 / 119,895,329 B | Historical installer inspection; no current writer found; delete candidate |
| installer-inspect-full | 10 / 119,895,149 B | Historical installer inspection; no current writer found; delete candidate |
| local-downloader-smoke-explore | 6,952 / 83,779,434 B | Historical downloader exploration; no current writer found; delete candidate |
| macos-package-verify-fixture | 4 / 3,691 B | Fixture; no current writer found; delete candidate |
| manual-runtime-smoke | 17,902 / 219,301,712 B | scripts/smoke-managed-python-downloaders.mjs:59-64 default config root; retain while runtime smoke runs, then regenerate/delete |
| nsis-upgrade-smoke | empty | Historical fixture; delete candidate |
| python-runtime-inspect | 1 / 25,593,816 B | Runtime inspection/archive; no current writer found; retain only if an active investigation cites it |
| python-runtime-manual | 8,221 / 169,277,156 B | Historical manual runtime evidence; no current writer found; delete after task-owner check |
| root smoke files | 3 files / 968 B | douyin-session-smoke-fake-cookies.txt (122 B), pinterest-sim-stderr.txt (810 B), pinterest-sim-stdout.txt (36 B); local smoke residue, delete candidates after no process |

Current script destinations explain the only clearly live build roots:

- ensure-capability-probe-runtime.mjs:16 -> build/capability-probe-runtimes.
- generate-capability-probe-review.ts:20 -> build/capability-probe-review/review.json.
- generate-download-telemetry-report.ts:91-94 -> build/download-telemetry-report/{report.json,report.md,report.html}; this child was not present in the measured listing but is a valid future output.
- smoke-managed-python-downloaders.mjs:59-64 -> build/manual-runtime-smoke/unicode-config-测试 unless --configDir is supplied.
- release.yml:127-130 writes build/macos-runtime-package-verification-<arch>.json in CI/local runs.

### dist-release (ignored, 5,075,044,507 B / 37,932 files)

Immediate files are Ameow_0.3.0_windows_x64_installer.exe (119,899,567 B), its blockmap (127,474 B), Ameow_0.3.1_windows_x64_installer.exe (119,554,127 B), its blockmap (125,430 B), builder-debug.yml (6,543 B), and latest.yml (371 B). portable is 4,475,411,079 B / 37,851 files; win-unpacked.tmp is 359,919,916 B / 75 files. There is no current win-unpacked directory, so win-unpacked.tmp is a failed/leftover Electron Builder output.

portable contains:

- Ameow_0.3.1_browser_extension.zip: 240,290 B.
- Ameow_0.3.1_windows_x64_portable.zip: 167,633,625 B.
- Ameow_portable mirror: 430,778,415 B / 3,788 files.
- portable-verification.json: 462 B.
- verification: 9 timestamped extraction directories, 3,876,758,287 B total. The latest is Ameow_portable_verify_20260716_173406 (430,778,415 B); portable-verification.json points to its Ameow_portable child.

The eight older verification directories total exactly 3,445,979,872 B (3.21 GiB decimal). They are reproducible package extractions, but retaining them may be a user choice if historical release snapshots are needed. Do not remove the latest path or mirror before package validation is complete.

scripts/package-portable.ps1:73-82 owns dist-release/portable names; lines 134-164 create a new timestamped extraction and overwrite portable-verification.json; no retention/pruning is performed. A minimal recurrence fix would prune older successful timestamp dirs only after metadata is written and validation succeeds.

win-unpacked.tmp is byte-for-byte identical (75 files, Compare-Object reported no differences) to archived task evidence at .trellis/tasks/archive/2026-08/08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning/evidence/package-win-clean/win-unpacked.tmp. Both task validation records document an external EPERM; retain task evidence until those gates are closed, then remove the root duplicate if the user wants local disk recovery.

### .trellis (mixed, 1,224,906,614 B observed at inventory time)

Top-level bounded totals:

| Child | Files / bytes | Notes |
|---|---:|---|
| .backup-2026-07-30T08-37-23 | 277 / 2,471,871 B | Ignored Trellis update backup; no current reference found |
| .backup-2026-07-30T08-37-50 | 296 / 2,684,493 B | Same |
| .backup-2026-08-12T10-57-05 | 316 / 3,035,937 B | Same |
| .backup-2026-08-24T08-33-13 | 329 / 3,153,459 B | Same |
| .backup-2026-09-04T03-16-29 | 327 / 3,150,907 B | Same |
| .runtime | 11 / 1,931 B | Ignored active-session/runtime pointer; retain during sessions |
| agents | 2 / 4,881 B | Tracked Trellis agent definitions; protect |
| scripts | 93 / 1,214,227 B | Tracked workflow scripts plus ignored Python caches; protect scripts |
| spec | 70 / 659,025 B | Tracked project specifications; protect |
| tasks | 17,501 / 1,207,578,550 B | Active/archive tasks and evidence at the pre-report snapshot; see below |
| tmp | 53 / 519,373 B | 49 tracked old extension package snapshot files plus four ignored logs; see below |
| workspace | 17 / 373,306 B | Journals/indexes; protect tracked records, prune only ignored stale logs |

All five .backup-* directories are already excluded by .trellis/.gitignore and have no current references found. Their aggregate observed size is exactly 14,496,667 B (13.83 MiB); removal is a reversible local cleanup decision, not a source change. The .trellis total above includes top-level files and these children; the tasks figure is the pre-report snapshot, so writing this report increases the live total.

The largest archive concentrations are 2026-08 (15,300 files / 1,176,026,587 B), 2026-09 (520 / 28,095,629 B), 2026-06 (306 / 997,975 B), 2026-05 (306 / 737,815 B), 2026-03 (556 / 780,051 B), 2026-04 (241 / 312,070 B), 2026-02 (157 / 169,118 B), and 2026-07 (71 / 221,925 B). Within 2026-08, the largest task evidence trees are:

- 08-25-managed-ytdlp-p2v-runtime-contract-repair: 4,112 files / 433,606,523 B.
- 08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning: 4,112 / 408,216,627 B.
- 08-25-managed-ytdlp-p2v-evidence-gates: 5,142 / 245,184,579 B.

These trees contain validation-referenced managed runtimes, package manifests, and reproducibility evidence. Do not recursively delete archive tasks merely because they are large. P2-A package-win-clean and P2-V fresh-package-output-direct each contain 75-file/359,919,916-B failed package outputs; they are duplicates but both validation narratives cite their task-owned paths.

.trellis/tmp has:

- tracked FlowSelect_0.4.0-beta.8_browser_extension.zip: 115,208 B;
- tracked browser-extension-package-check-extracted/browser-extension: 48 files, about 402,984 B, an old extracted extension snapshot containing picker/detector files removed from current source;
- ignored docs-vite/settings-hub-drilldown logs totaling 1,181 B.

No current reference to browser-extension-package-check, its extracted directory, or the ZIP was found. This is a tracked repository-bloat candidate, but deletion must be a later implementation commit with current scripts/package-browser-extension.mjs and package tests as validation.

### desktop-assets, site, screenshots, and other small concentrations

- desktop-assets/binaries/python-aarch64-apple-darwin: 2,359 files / 52,699,815 B ignored; python-x86_64-apple-darwin: 2,355 / 52,929,965 B ignored; python-x86_64-pc-windows-msvc: 4,161 / 72,868,569 B ignored. Tracked ytdlp-baseline is 3 files / 3,239,284 B and .official-python-runtimes.json is 1,917 B. scripts/python-runtime.mjs and ensure-python-runtime.mjs use these canonical roots; the manifest declares Python 3.11.15 and exact target hashes. Preserve while packaging/dev prerequisites or active runtime tasks need them.
- desktop-assets/icons is tracked: 9 files / 1,030,178 B (including icon.ico/icon.icns and source app icons). electron-builder.config.mjs packages icon.ico, app-icon.png, and public/favicon.ico; do not deduplicate by appearance.
- site/.astro is generated (7 files / 872,241 B), site/dist is generated (139 / 3,557,799 B), four site preview logs total 803 B, and site/node_modules is skipped. site/.gitignore already ignores dist/.astro/node_modules/logs. Preserve site source/package/lock; generated folders are local rebuild outputs.
- docs-screenshot-captures/README.md documents older real-Electron/extension captures and says npm run docs:screenshots, but that command was retired (archive validation 08-18 confirms removal). The live capture script is scripts/capture-lab-smoke.mjs, invoked by lab:capture and defaulting to docs-screenshot-captures/lab. Root PNGs (12) are dated 2026-05-29; Lab PNGs are dated 2026-09-10. Treat the README command as historical documentation requiring an explicit docs decision, not as proof the PNGs are unused.
- .claude/skills contains reparse/link entries; traversal was intentionally skipped. .codex/hooks/__pycache__ and Trellis Python __pycache__ entries are ignored, reproducible caches.

## User examples (exact status and ownership)

### mr3-windows-smoke-evidence.json

Git status is tracked and clean; size is 3,429 B; no .gitignore or .git/info/exclude rule matches it. The file begins with the non-standard marker MR3_SMOKE_EVIDENCE and records 11 compact/expanded/determinate/click/removal scenarios with draw, arc, requestAnimationFrame, canvas dimensions, pixel probes, and title Ameow. Git history identifies 73cb29a2 (feat(presentation): add progress field) as the add commit; the associated mr3-smoke.cjs producer was removed by 30e0e545 (feat(presentation): consolidate browser lab). Current FFF searches found no reader/producer for the exact filename/content; only the current task PRD names it. It is unique historical evidence, not a reproducible generated build input.

Preferred future destination is an evidence subdirectory under the archived MR3 task, for example .trellis/research/archive/2026-08/08-13-mr3-progress-field/research/evidence/mr3-windows-smoke-evidence.json, with any references updated and a small archive discoverability check. Retaining it at root is also defensible if preserving the historical filename is more important than root cleanliness. Deletion is not supported by current evidence.

### simple-icons-16.20.0.tgz

Git status is ignored/no status entry; the only matching rule is .git/info/exclude lines 8-9, not project .gitignore. tar listing has 3,451 entries including the complete simple-icons package, package version 16.20.0, LICENSE.md, README.md, DISCLAIMER.md, and CC0-1.0 metadata. No package.json/package-lock/source/Electron/script/site/docs live consumer exists; FFF finds only archived planning text that explicitly says not to depend on the full package and to vendor only used local SVG paths. It is not included by electron-builder.config.mjs and no current producer downloads it. Deleting this local archive is the smallest disk/root cleanup if the owner confirms no offline experiment needs it; otherwise move it outside the checkout to a named local downloads/cache directory and leave project ignore policy unchanged.

## Caveats and not-found evidence

- No build, test, generator, package, or network command was run; all facts are read-only inventory/reference checks.
- node_modules and .git were not traversed. Reparse/link-bearing .claude paths were not followed. No machine-wide disk measurement was attempted.
- “No current reference” means no match in the bounded FFF/search scope and current scripts/docs inspected; it does not erase unindexed external process handles or a user's offline workflow.
- Historical task evidence is intentionally not treated as disposable cache. Any deletion phase must first enumerate active-task references, stop package/runtime processes, and keep a reversible record.
- This report separates repository-root beautification from local disk recovery and tracked repository bloat. No Git-history rewrite is proposed.
