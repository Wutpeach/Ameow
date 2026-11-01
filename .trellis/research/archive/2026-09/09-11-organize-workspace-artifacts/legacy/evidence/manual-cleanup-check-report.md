# Manual cleanup independent check — 2026-09-11

## Outcome

**PASS: the revised manual-cleanup scope is ready for the deletion commit and subsequent task closure.** All 32 exact deletion candidates from final-check-report.md are absent. Protected release data and migrations pass the checks below. Automatic retention is absent.

Checked on main at migration commit 1fc66470. This worker performed read-only verification and wrote only this report; no deletion, restoration, staging, commit, archive, product-file change, process termination, or runtime packaging/capture run occurred.

## Findings (fixed)

None. No product defect or unexpected content change was found.

## Findings (not fixed)

- Git still reports ` M scripts/package-portable.ps1`, as previously documented. Its bytes equal baseline bc5c21ef and HEAD exactly; SHA-256 is `8C2A9A44C5344CDD3A1ECEF1B7FAACB700BBC185299EF68FA505A604545F25C2`. Diff and numstat are empty; index/worktree EOLs are LF. No index refresh was performed.
- Current task records remain untracked, as expected. Older historical paragraphs/checklists still describe blocked cleanup or pending automatic-retention decisions. Lead should update current acceptance/status bookkeeping to reference this report before closure, preserving historical rejection evidence. This worker owns only this report.
- No unexpected tracked changes were found: exactly 49 unstaged snapshot deletions, the content-identical portable-script status indication, and this untracked task directory. Staged diff is empty.

## Exact deletion verification

Every path below is **absent**, checked with `os.path.lexists` (including dangling-link detection). Remaining candidates: **none**.

```text
simple-icons-16.20.0.tgz
.trellis/tmp/browser-extension-package-check/FlowSelect_0.4.0-beta.8_browser_extension.zip
.trellis/tmp/browser-extension-package-check-extracted/browser-extension
dist-release/win-unpacked.tmp
.trellis/.backup-2026-07-30T08-37-23
.trellis/.backup-2026-07-30T08-37-50
.trellis/.backup-2026-08-12T10-57-05
.trellis/.backup-2026-08-24T08-33-13
.trellis/.backup-2026-09-04T03-16-29
dist-release/portable/verification/Ameow_portable_verify_20260602_112831
dist-release/portable/verification/Ameow_portable_verify_20260603_183601
dist-release/portable/verification/Ameow_portable_verify_20260604_135232
dist-release/portable/verification/Ameow_portable_verify_20260604_142231
dist-release/portable/verification/Ameow_portable_verify_20260604_172829
dist-release/portable/verification/Ameow_portable_verify_20260604_234317
dist-release/portable/verification/Ameow_portable_verify_20260605_113218
dist-release/portable/verification/Ameow_portable_verify_20260617_190425
build/external-download-smoke
build/python-runtime-manual
build/installer-inspect-final
build/installer-inspect-full
build/local-downloader-smoke-explore
build/douyin-site-session-default-check
build/douyin-site-session-redaction-check
build/douyin-site-session-smoke
build/python-runtime-inspect
build/github-artifacts
build/macos-package-verify-fixture
build/cp-test-src
build/cp-test-dst
build/installer-inspect
build/nsis-upgrade-smoke
```

## Root count

Immediate root entries including hidden entries: **53**, compared with 56 originally and 54 after migration. The exact original-to-current removed names are `docs-screenshot-captures`, `mr3-windows-smoke-evidence.json`, and `simple-icons-16.20.0.tgz`; no root names were added. The first two are preserved relocations; the tarball accounts for the final 54-to-53 decrease.

## Protected-data evidence

- Metadata `dist-release/portable/portable-verification.json` parses as UTF-8 with BOM, is 462 bytes, and has SHA-256 `6D697A7AB521824C5D9CB9543CD4CAE1F68C09B4430F932FDBDA25DDDDF74D39`. Version is 0.3.1, generatedAt is 2026-07-16T17:34:51. Its extraction is `dist-release/portable/verification/Ameow_portable_verify_20260716_173406/Ameow_portable`; mirror is `dist-release/portable/Ameow_portable`; ZIP is `dist-release/portable/Ameow_0.3.1_windows_x64_portable.zip`.
- Only `Ameow_portable_verify_20260716_173406` remains immediately beneath verification. Extraction and mirror each contain **3,788 files / 430,778,415 logical bytes**. Full relative-path, size, and SHA-256 manifests match each other and all 3,788 non-directory entries in the retained ZIP. Traversal found no symlink/junction. The marker identifies Ameow, windows-portable, version 0.3.1.
- Portable ZIP SHA-256 is `22CFDE0E2030A2D992FCF4ADF34CE2E0B8109BEE6CA4DE16288FCD54DD39F4EB`, matching metadata. Full ZIP reads succeeded.
- Retained current `dist-release/portable/Ameow_0.3.1_browser_extension.zip` passes ZIP CRC checks, has 68 entries, and embeds manifest version 0.3.1. Task-generated `build/09-11-organize-workspace-artifacts/browser-extension-package/Ameow_0.3.1_browser_extension.zip` passes CRC checks, has 82 entries, and embeds version 0.3.1. These are distinct artifacts, not claimed byte-identical.
- Retained P2-A copy at `.trellis/tasks/archive/2026-08/08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning/evidence/package-win-clean/win-unpacked.tmp` remains readable with **75 files / 359,919,916 bytes**, matching the previous inventory. All files were read for hashes. Equality with the deleted root copy relies on the pre-deletion comparison in migration-cleanup-report.md; an absent copy cannot be rehashed.
- `build/docs-screenshot-captures` retains **18 files: 17 PNGs and README**. Every PNG passes its signature check; all 17 sizes and SHA-256 values currently equal the migration report's pre-capture manifest. This includes the 12 historical images. The five Lab images were regenerated during earlier accepted checks and happen to match those earlier bytes. The explicit override retains exactly compact-pointer.png, download-active.png, download-queued.png, runtime-failed.png, and transcode-failed.png; all pass PNG signatures.
- Archived MR3 JSON remains **3,429 bytes**, SHA-256 `7679CF27543919B1D8CFAEFEE18233EFDD080B2D27A6C5FF21E70260010559AB`, at `.trellis/tasks/archive/2026-08/08-13-mr3-progress-field/research/evidence/mr3-windows-smoke-evidence.json`. The archive report's relative evidence link resolves.
- Capture script, root ignore file, and frontend directory spec hashes match final-check-report.md exactly. Prior accepted capture default/override runtime evidence remains applicable.
- `.tmp-config`, `Ameow_Received`, `.cookies.json`, `.trellis/.runtime`, runtime manifest/baseline, and build/capability-probe-runtimes, build/capability-probe-review, and build/manual-runtime-smoke remain present. Cookie contents were not read. The official Python manifest parses with the three expected Windows/macOS targets. The three non-candidate root build smoke files also remain.
- Unchanged tracked source/config/archive paths are covered by Git's exact diff boundary. This is not a forensic hash baseline of every ignored file, credential, dependency, runtime tree, or external link target.

## Git deletion boundary

Set equality was checked between `git ls-tree -r --name-only HEAD -- <exact ZIP> <exact extracted subtree>` and `git diff --name-only --diff-filter=D HEAD`: **49 expected, 49 actual, zero missing, zero extra**. This is one obsolete ZIP and exactly 48 extracted files under the two candidate paths above. No product source or unique archived evidence is deleted.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | PASS, fresh exit 0; configured src and vite.config.ts scope |
| `npm run type-check` | PASS, fresh exit 0; renderer and Electron no-emit checks |
| Scoped `git diff --check -- .trellis/tmp/browser-extension-package-check .trellis/tmp/browser-extension-package-check-extracted scripts/package-portable.ps1 .trellis/tasks/09-11-organize-workspace-artifacts` | PASS |
| Report whitespace | Checked separately because task directory is untracked |
| Absence, deletion set equality, baseline byte equality, package manifests, PNG/MR3 integrity | PASS |
| Runtime/capture/package tests | Prior accepted evidence reused; unchanged tests not repeated |

No real Electron launch or package smoke was needed or run. The previous report documents unavailable dist-release/win-unpacked and accepted capture/default/override, capture cleanup, parser, controlled package flow, and eight extension versioning tests. Read-only checks introduce no changed behavior requiring those runs. Rejected automatic-retention reproducer results remain rejection evidence, not passing production checks.

Verification-command corrections: an initial metadata lookup used the wrong parent (correct location is dist-release/portable), and Python reads were changed to UTF-8 / UTF-8-sig for report text and BOM metadata. Corrected read-only checks passed; neither was a product failure.

## Logical-byte accounting and closure limits

**4,817,299,951 logical bytes is the historical pre-deletion content total** for these disjoint scopes:

| Scope | Historical logical bytes |
| --- | ---: |
| Tarball | 6,479,178 |
| 49 tracked snapshot files | 518,192 |
| Five backups | 14,496,667 |
| Eight old extractions | 3,445,979,872 |
| Root failed-package duplicate | 359,919,916 |
| Fifteen build children | 989,906,126 |
| Total | 4,817,299,951 |

This pass proves paths are absent; it did not observe the manual operation, remeasure contents immediately before it, inspect Recycle Bin handling, or measure filesystem allocation/free-space changes. The total is approximately 4.817 GB / 4.486 GiB of previously inventoried logical content, **not measured disk recovery**. Moves and retained copies are not additional savings. Git history still retains the obsolete snapshot; no history-size reduction is claimed.

AC3/AC4 and revised manual retention now have completion evidence; AC6 has fresh lint/type-check, whitespace and bounded accounting. Proceed to the Lead-owned deletion commit and accurate task/journal closure after the applicable commit gate. Automatic pruning stays out of scope; packaging retains baseline behavior.
