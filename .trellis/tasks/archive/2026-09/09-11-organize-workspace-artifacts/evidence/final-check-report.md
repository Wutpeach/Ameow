# Final independent check — 2026-09-11

Git status caveat: this environment still prints ` M scripts/package-portable.ps1` after restoration, but its SHA-256 exactly matches the baseline blob, `git diff` and `git diff --numstat` for that file are empty, and both index/worktree EOLs are LF. No index refresh or staging was performed to alter that status indication.

## Outcome and commit boundary

**Migration source gate: PASS. Automatic latest-successful portable retention: NOT IMPLEMENTED. Disk cleanup: POLICY-BLOCKED. Overall task: INCOMPLETE.**

The rejected retention implementation reproduced three data-preservation failures. Following the coordinator's explicit disposition (`msg_0d99b99b7964`), its source and extended reproducer were retained as ignored task-local evidence, and only `scripts/package-portable.ps1` was restored byte-for-byte to `bc5c21ef` (also current HEAD). No branch switch, staging, commit, push, process termination, real release mutation, or deletion retry occurred. The old research terminal was not touched.

It is safe to commit the concrete capture/MR3 migration, its narrow ignore change, frontend spec update, and accurate task evidence. Do not include ignored fixtures or rejected scripts, claim latest-successful retention, mark cleanup complete, or treat the earlier portable implementation report as final acceptance. The baseline portable behavior still accumulates verification extractions; its pre-existing collision/failure semantics are unchanged.

## Findings (fixed or removed from production)

- **Metadata replacement bug:** the proposed `File.Replace(temp, destination, $null)` failed even with an unlocked existing metadata file: PowerShell bound the string argument as an empty path (`The path is empty. (Parameter 'path')`). The earlier test exercised initial publication and locked replacement, so it missed successful replacement. A local fix using `[System.Management.Automation.Language.NullString]::Value` passed successful replacement in both PowerShell families. This fix exists only in the rejected snapshot; production was restored entirely.
- **Misleading partial-removal reporting:** `Keeping` / `retention kept` implied intact preservation after recursive removal failed. Changed those messages in the rejected snapshot to explicitly state that contents may be partially deleted. This corrected reporting, not the underlying data-loss behavior; production was restored entirely.
- **Test false confidence:** extended the single existing AST-loaded production-function check to inspect locked candidate contents, extra user content, a deterministic overlapping-publisher interleaving, successful metadata replacement, same-second collisions, root/ancestor/nested reparse rejection, and the full production extension-failure flow. Replaced test-only `Join-String` with `-join` for Windows PowerShell compatibility. The rejected reproducer intentionally exits 1 on its three safety failures.
- **Safe final scope:** removed unsafe retention from production by exact baseline restoration after checking the reviewed source hash and HEAD baseline. Existing evidence ignore rules cover all rejected scripts and fixture trees; removed the obsolete unignore exception for the former check filename. The frontend Lab contract now records the verified capture default and override behavior.

## Findings (not fixed; separate design decision required)

1. **Locked third-party files allow partial recursive deletion.** `Get-Process -Name Ameow` cannot establish inactivity for arbitrary file handles. In a tiny exclusive fixture, an open `locked.bin` caused `Remove-Item -Recurse` to throw only after deleting `.ameow-portable.json`. The candidate root and locked file remained, so the original check passed while package contents were already lost. Both PowerShell 7 and Windows PowerShell reproduced this. A surviving root is not proof of preservation; a warning or preflight open followed by a race window cannot guarantee it.
2. **A recognized package marker does not establish ownership of all candidate contents.** A timestamp candidate containing a valid `Ameow_portable/.ameow-portable.json` plus sibling `user-notes.txt` passed recognition/reparse/process checks and was deleted wholesale. The proposed implementation has no inventory/unchanged-content evidence and does not reject that extra content. The same ownership concern applies to user content inside a previously launched portable tree.
3. **Current metadata is not protected across overlapping runs.** The production caller passes its own in-memory `portableVerificationInfo.verificationPath`; it does not read durable metadata. The deterministic sequence “A publishes A; B publishes B; A prunes using A” deletes B while on-disk metadata still points to B. There is also no active packaging ownership marker: one publisher can prune another extraction before it publishes. Same-second exclusive directory creation only protects that one creation step, not shared ZIP/mirror/metadata/prune operations.

**Smallest separate decision:** keep manual retention unless the owner approves a bounded automatic policy that proves candidate contents are disposable/unchanged and serializes package publication plus pruning. An ownership inventory and coordinated single-writer boundary would require a reviewed design; a process-name check, timestamp rule, atomic metadata file alone, or another catch block is insufficient. No such expansion was made here.

The proposed 284-line helper addition was not justified as a completed “small safe prune”: much of its path validation was relevant, but it still failed the essential ownership and concurrency guarantees. Restoring the baseline is smaller and safer than shipping a partially effective cleanup framework.

## Verification

| Gate / command | Result and limit |
| --- | --- |
| `npm run lint` | PASS, fresh run after final source restoration. Its configured scope is `src` and `vite.config.ts`; script syntax is checked separately. |
| `npm run type-check` | PASS, fresh run after final source restoration. |
| `node --check scripts/capture-lab-smoke.mjs` | PASS. |
| `node scripts/capture-lab-smoke.mjs --cleanup-self-check` | PASS: parent-path rejection, inherited/pre-existing preservation, owned child exit/removal, failed spawn. |
| Default and explicit capture | Earlier implementation evidence reports both five-scenario live runs passed. Independently verified all five PNGs at each destination, PNG signatures, unchanged one-line default diff, override code, and absence of retired root. No new capture concern justified repeating full browser captures. |
| PowerShell parser | PASS for restored production script in PowerShell 7 and Windows PowerShell. Windows PowerShell also parsed both rejected evidence scripts. |
| `pwsh -NoProfile -File .../package-portable-retention-check.ps1` before evidence rename | FAIL as intended after extension: all three safety failures reproduced; metadata replacement, collision, link guards, invalid ZIP, locked metadata and wrong-parent assertions passed. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .trellis/tasks/09-11-organize-workspace-artifacts/evidence/rejected-portable-retention-check.ps1` | FAIL, exit 1, after preserving the rejected source: same three concrete failures. Final fixture `portable-retention-fixture-3f8c05f7d3384bfdb065a51773622b26`. This is rejection evidence, not a passing production regression test. |
| Controlled full production flow | PASS for extension failure ordering using an exclusive miniature repository, tiny fake unpacked EXE, actual copy/archive/extraction/marker code, and a stub extension command returning 17. Prior metadata SHA-256 and prior extraction sentinel survived. No real desktop app was launched. |
| Extension packaging | Reviewed prior `npx vitest run scripts/browser-extension-versioning.test.mjs` evidence: 8 passing tests. Independently reopened the task-owned ZIP: 82 entries, embedded manifest version `0.3.1`. Snapshot deletion remains blocked. |
| `git diff --check` | PASS after final changes; `git diff -- scripts/package-portable.ps1` is empty. |
| Docs validation | No public/developer docs source links changed. FFF found no live references to the 12 historical PNG names. The only archive-link edit resolves to preserved MR3 bytes. Frontend prose-only spec was checked against source and whitespace; no public docs build was needed. |

No real package smoke ran: `dist-release/win-unpacked` is absent, and overwriting current release assets was prohibited. The controlled fixture tests do not establish real Electron runtime behavior, absence of arbitrary native handles, crash durability, or concurrency safety beyond the reproduced interleaving. Normal failures before metadata publication preserve prior metadata/extraction in the rejected single-run flow, but existing shared ZIP/mirror refreshes happen earlier and are not transactional. Metadata replacement is an atomic filesystem operation, not proof of complete package transaction durability.

## Migration and protected-data verification

- Root entries decreased from 56 to 54 solely through the two relocations. `docs-screenshot-captures/` and root `mr3-windows-smoke-evidence.json` remain absent.
- The capture tree has all 17 image paths plus its corrected historical README. Independently matched all 12 historical image sizes and SHA-256 values against `migration-cleanup-report.md`. The previous worker verified all 17 before fresh captures; the five Lab outputs were intentionally regenerated and are not claimed byte-identical to pre-capture images.
- Default capture directory: `build/docs-screenshot-captures/lab`. Explicit task-owned override: `build/09-11-organize-workspace-artifacts/capture-override`. Both contain exactly `compact-pointer.png`, `download-queued.png`, `transcode-failed.png`, `runtime-failed.png`, and `download-active.png`.
- MR3 destination: `.trellis/tasks/archive/2026-08/08-13-mr3-progress-field/research/evidence/mr3-windows-smoke-evidence.json`. Size 3,429 bytes; SHA-256 `7679CF27543919B1D8CFAEFEE18233EFDD080B2D27A6C5FF21E70260010559AB`. The relative archive report link resolves correctly.
- FFF live-reference search excluding `.trellis/tasks/` found only the new default in the capture script; searches for the 12 historic PNG filenames found no live matches. Historical task records were preserved.
- `git check-ignore -v` confirms the new capture destination is ignored by existing `build`, retired root captures are no longer ignored (exit 1 is expected), and rejected scripts/fixture trees are ignored by task evidence `.gitignore`.
- Independently parsed real `portable-verification.json` read-only: its verification extraction, mirror and ZIP exist, and ZIP SHA-256 matches metadata. Current `20260716_173406` extraction remains protected. No retention test was run against real `dist-release`.

## Remaining cleanup paths and logical bytes

Fresh read-only enumeration rejected reparse entries and remeasured the exact disjoint candidates; totals match the implementation report. All remain. No policy-rejected delete was retried or bypassed.

| Scope | Logical bytes |
| --- | ---: |
| `simple-icons-16.20.0.tgz` | 6,479,178 |
| `.trellis/tmp/browser-extension-package-check/FlowSelect_0.4.0-beta.8_browser_extension.zip` and `.trellis/tmp/browser-extension-package-check-extracted/browser-extension/` (49 tracked files total) | 518,192 |
| Five `.trellis/.backup-*` roots listed below | 14,496,667 |
| Eight old portable verification roots listed below | 3,445,979,872 |
| `dist-release/win-unpacked.tmp` | 359,919,916 |
| Fifteen conditional `build/` children listed below | 989,906,126 |
| **Total remaining** | **4,817,299,951** |

Backup suffixes: `2026-07-30T08-37-23`, `2026-07-30T08-37-50`, `2026-08-12T10-57-05`, `2026-08-24T08-33-13`, `2026-09-04T03-16-29`.

Old extraction suffixes beneath `dist-release/portable/verification/Ameow_portable_verify_`: `20260602_112831`, `20260603_183601`, `20260604_135232`, `20260604_142231`, `20260604_172829`, `20260604_234317`, `20260605_113218`, `20260617_190425`.

Conditional `build/` children: `external-download-smoke`, `python-runtime-manual`, `installer-inspect-final`, `installer-inspect-full`, `local-downloader-smoke-explore`, `douyin-site-session-default-check`, `douyin-site-session-redaction-check`, `douyin-site-session-smoke`, `python-runtime-inspect`, `github-artifacts`, `macos-package-verify-fixture`, `cp-test-src`, `cp-test-dst`, `installer-inspect`, `nsis-upgrade-smoke`.

`.tmp-config/` remains retained for the current service-test reference (0 bytes in prior inventory). Current source/runtime inputs, active task data, archived evidence, and current release assets are not cleanup candidates. No space savings are claimed: capture migration (1,990,047 logical bytes after README correction) and MR3 relocation (3,429 bytes) are moves; controlled fixture deletion is not workspace cleanup savings. The 4,817,299,951-byte total is logical content, not allocated disk space.

## Source hashes and spec disposition

| File | Final SHA-256 |
| --- | --- |
| `scripts/package-portable.ps1` — restored exact baseline | `8C2A9A44C5344CDD3A1ECEF1B7FAACB700BBC185299EF68FA505A604545F25C2` |
| `scripts/capture-lab-smoke.mjs` | `CD9E4D1927B0F421C82EB898D2D0EAB71A4C050BF3C6E5B67F1F488F4E2199F4` |
| `.gitignore` | `FB30F2A10C670E26E41131D27C8838FA859FD15910C9C8775B0A2A13C86D9303` |
| `.trellis/spec/frontend/directory-structure.md` | `71831FBBB26920017ED3EC56297E49E9F85FCB35ACE540D2B13C0EEA4547A038` |
| Archived MR3 `research/repository-grounded-planning-report.md` | `B0E0617598E3E1A2DFEF6F4E5BCAEEC428E033421EE8AA97857EDF231CC721E8` |
| Ignored `evidence/rejected-package-portable.ps1` — reviewed pre-restoration source | `D8E6F18E47685FAC7B88287CB1F3EA45281EC1A10077920CE2E55C40D737CF81` |
| Ignored `evidence/rejected-portable-retention-check.ps1` | `4D125DAB6EDCDFEF76926CFEC7A529B8F624151C64202D1E093A700CB85381F3` |

Read the Trellis update-spec skill. Changed only two concise additions inside the existing frontend Lab contract. No backend retention contract was published because the candidate failed and the coordinator explicitly required baseline restoration. No PRD/design/implement or research history was edited.

## Local evidence remnants (ignored; do not commit)

All paths here are relative to this task's `evidence/`. Retained `rejected-package-portable.ps1`, `rejected-portable-retention-check.ps1`, and `portable-retention-fixture` plus these fixture suffixes:

```text
05d983927f9e49549d583be02bd4dc90
1692828b64e240b49d56cb1329065b2e
2d19a64162924180a58c0e6da5c572a8
3f8c05f7d3384bfdb065a51773622b26
40f855677d8a4369afa501f2dffc2e1a
4b4a5e63f8e249d991df6e5789babd0e
5a929a2111a54e68b8ead648e86ddcc6
5e33552a24ab45fcb752bc5863ce916f
b534d976310a43ab9d24952f6b945688
cdc17d93881f43df8870578da0f28f52
d795481bb6fe49d585caccf1b5ec13f0
f6c4647548374e4a98463458903f4290
f9e98ee5208645ff80d4818df2a9da28
```

Earlier fixture cleanup was policy-rejected; no cleanup retry occurred. New tests used exclusive GUID directories and touched only their own tiny fixture contents. Ignored rejected evidence is available in this workspace, not promised to exist after a fresh checkout. This report preserves the durable findings and exact hashes.
