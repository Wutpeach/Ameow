# Workspace organization design — approved 2026-09-11

## Implementation finding — automatic retention rejected

Final user decision: “同意改为手动清理，并先提交上述迁移改动”. The manual-cleanup revision below is accepted and supersedes the original automatic-retention design. Packaging remains at baseline; migration-only commit is authorized. Remaining cleanup is still outstanding.

The approved design below is retained as history. Final independent checks in `evidence/final-check-report.md` rejected its automatic-retention implementation: a locked file allowed partial deletion, a package marker did not establish ownership of extra user content, and overlapping publishers could delete the extraction referenced by current metadata. The portable script was restored exactly to baseline; automatic retention is absent.

The verified capture/MR3 migrations remain suitable for a separate work commit. All 4,817,299,951 logical bytes of deletion candidates remain policy-blocked. Proposed revision, pending user decision: perform this cleanup manually and keep automatic deletion out of packaging. Any future automation needs evidence that candidate contents remain disposable plus coordinated publication/pruning; additional catch blocks are insufficient. This proposal does not change the approved requirements or close this task by itself.

## Outcome and directory policy

Keep established source, tooling and build configuration locations. Most of the 56 root entries are real entry points/configuration/source roots; a cosmetic root rewrite would spread changes across Electron, Vite, TypeScript, CI and docs. This task instead removes loose historical/download files, moves capture output into existing build storage, and prunes obsolete children.

- `src/`, `electron/`, `browser-extension/`, `site/`: current application and docs source.
- `scripts/`: existing executable tooling, with minimal output/retention changes.
- `build/`: ignored local probes, smoke outputs and captures.
- `dist`, `dist-electron`, `dist-scripts`, `dist-release`: keep existing compiler/package output contracts.
- `.trellis/tasks/archive/<month>/<task>/`: retained task-specific historical evidence.
- No new top-level artifact/cache/archive directory, new dependency or generic cleanup service.

## Exact proposed first-pass actions

| Source | Action / destination | Evidence and required guard |
| --- | --- | --- |
| `simple-icons-16.20.0.tgz` | Delete local download | No identified live dependency/reader; user plan approval opts out of offline retention. Never touch package-lock or vendored SVGs. |
| `mr3-windows-smoke-evidence.json` | Move to `.trellis/research/archive/2026-08/08-13-mr3-progress-field/research/evidence/mr3-windows-smoke-evidence.json` | Preserve exact bytes; verify destination has no conflicting file, and add a discoverable link in the task's existing report/index. Current filename is historical evidence, not a live input. |
| `docs-screenshot-captures/` | Move contents to `build/docs-screenshot-captures/` | Preserve all 18 inventoried files, including 12 historical images and 5 Lab images; detect collisions and compare hashes. Update live Lab default to `build/docs-screenshot-captures/lab`, preserve explicit `--output`. Label historical README material accurately; do not claim lab:capture recreates old Electron/extension images. |
| `.trellis/tmp/browser-extension-package-check/FlowSelect_0.4.0-beta.8_browser_extension.zip` | Delete tracked obsolete ZIP | Existing Git history retains exact old package; no current reader found. |
| `.trellis/tmp/browser-extension-package-check-extracted/browser-extension/` | Delete only the 48 tracked snapshot files | Enumerate again to avoid deleting newly added data. Preserve unrelated `.trellis/tmp` files. |
| Five `.trellis/.backup-*` roots named below | Delete ignored update rollback copies | No update/rollback in progress; approval chooses to forgo these convenience backups. Protect current specs/scripts/tasks/workspace. |
| Eight old `dist-release/portable/verification/Ameow_portable_verify_*` roots named below | Delete stale unpacked verification snapshots | Resolve current metadata and protect its extraction plus mirror/ZIPs. Verify intended latest data exists; skip running, changed, linked or uncertain candidates. |
| `dist-release/win-unpacked.tmp` | Delete root duplicate | Reconfirm byte equality with retained P2-A task evidence and no current builder/consumer. Keep archive evidence and related validation narratives. |
| `.tmp-config/` | Remove only if still empty and no tests use it | No recursive user-data deletion; if nonempty skip. Do not change service-test behavior in this pass. |

Exact backup roots: `.backup-2026-07-30T08-37-23`, `.backup-2026-07-30T08-37-50`, `.backup-2026-08-12T10-57-05`, `.backup-2026-08-24T08-33-13`, `.backup-2026-09-04T03-16-29` (all beneath `.trellis`).

Exact old extraction suffixes: `20260602_112831`, `20260603_183601`, `20260604_135232`, `20260604_142231`, `20260604_172829`, `20260604_234317`, `20260605_113218`, `20260617_190425`. The inventory's metadata points to `20260716_173406`; implementation must use current parsed metadata, never assume the dated inventory remains authoritative.

The old verification, root failed-package duplicate, backups and tarball are disjoint deletion roots totaling 3,826,875,633 logical bytes at inventory time (about 3.83 GB / 3.56 GiB). This excludes conditional build cleanup and tracked snapshot deletion. A move frees no net disk space. Actual allocation and deletion results must be measured/reported separately.

## Conditional nested build cleanup

The following are candidates, not unconditional deletion targets. Before any removal, inspect active-task references and establish no ongoing test/runtime use; preserve any unresolved item and report it rather than guessing:

- `build/external-download-smoke`
- `build/python-runtime-manual`
- `build/installer-inspect-final`, `build/installer-inspect-full`
- `build/local-downloader-smoke-explore`
- `build/douyin-site-session-default-check`, `build/douyin-site-session-redaction-check`, `build/douyin-site-session-smoke`
- `build/python-runtime-inspect`, `build/github-artifacts`, `build/macos-package-verify-fixture`
- `build/cp-test-src`, `build/cp-test-dst`, `build/installer-inspect`, `build/nsis-upgrade-smoke`

Do not automatically delete active default roots `build/capability-probe-runtimes`, `build/capability-probe-review`, `build/manual-runtime-smoke`, current CI reports or future telemetry output. No whole-build deletion. Exact root-level smoke-file paths may be proposed separately only after content/reference checks; they are not swept by a glob.

## Recurrence prevention

1. `scripts/capture-lab-smoke.mjs`: change only the default output directory to the existing build hierarchy. Retain every current capture/cache/process ownership guarantee and explicit output behavior. `.gitignore` already ignores build; remove the obsolete dedicated capture-root rule only after migration and reference review, without broadening ignore patterns.
2. `scripts/package-portable.ps1`: proposed policy is one latest successful extraction. Pruning occurs only after successful extraction validation and metadata persistence. Restrict deletion to exact known timestamp-directory children of the verified verification root; protect the metadata-referenced current path, reject unexpected/reparse paths, and skip paths with uncertain/running use. Never stop a process to prune. On package failure preserve previous extraction/metadata; on prune failure keep a valid successful package and report retained paths rather than claiming complete cleanup. Avoid adding a standalone cleaner or generic retention library. If safe automatic pruning cannot be expressed within this bounded contract, pause that source change for design review; manual cleanup can remain independently reviewable.
3. MR3 and simple-icons have no live generators, so they require no replacement tool. Existing build/site ignore and output conventions otherwise remain appropriate.
4. Update the existing relevant spec and developer guidance with artifact destinations and retention policy, not a second cleanup framework. Historical absolute evidence paths remain historical; update active consumers, not every archived log.

## Protected / deferred

- Keep user data (`Ameow_Received`, even though currently empty), `.cookies.json`, all source/config/licenses, desktop assets/runtime manifests and payloads, current release mirrors/ZIPs/installers, dependencies, Git data, tooling links and active-session state.
- Keep unique archived task evidence. Do not recursively delete `.trellis/tasks` or deduplicate P2-A/P2-V evidence across their narrative contracts.
- Existing dist/site build outputs are disposable when idle, but deleting them merely removes a few MB until the next build and does not permanently simplify the root. Leave them out of this pass.
- Do not centralize every root config under a new config directory or relocate package/runtime inputs for aesthetics.

## Windows execution and rollback

Use one shell end-to-end. Before each recursive move/delete validate resolved exact source/destination containment and reparse boundaries; do not follow links outside the authorized roots. Do not kill processes or use forceful Git cleanup. Known policy rejection of recursive deletes may recur: stop rejected operations, retain untouched scope, and report the exact block without switching mechanisms to bypass policy.

Tracked moves/deletions are reviewable normal Git diffs; do not rewrite history. Local ignored images have no guaranteed Git recovery, so migration requires source/destination hashes and collision checks before source removal. Removed release extraction copies can be recreated from retained ZIPs; backups and unused downloads are discarded only by plan approval. No new branch, commit, archive or push occurs in planning.

## Research caveats incorporated

Inventory sizes are logical bytes, not allocated space; use correct GB/GiB units. “No current reader” is bounded repository evidence, not a claim about external process handles. Some conditional build children still need active-reference checks before deletion; that uncertainty is an explicit skip condition. Research recommendations to stop processes do not authorize process termination. Capture consolidation above is a proposed Lead choice for root clarity and must be verified by the implementer against live callers before editing.
