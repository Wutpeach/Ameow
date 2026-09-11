# Migration and cleanup report

## Change boundary

The live Lab capture default is the only behavior change: its default output moves from the retired root capture directory to `build/docs-screenshot-captures/lab`, while `--output` remains unchanged. This worker owns the corresponding historical capture migration, the approved MR3 relocation, the exact snapshot/local cleanup allowlist, and evidence; it does not change portable-retention code, release/package inputs, active task artifacts, or any unapproved build/runtime data.

## Execution record

Preflight found every approved root non-reparse and no external process command line using a cleanup target; the only match was the preflight PowerShell process itself. Portable metadata still names the 20260716 extraction, its mirror and ZIP exist, its ZIP digest matches metadata, and the retained P2-A archive is byte-identical to `dist-release/win-unpacked.tmp` (75 files, 359,919,916 B each).

The first combined migration command was rejected before execution by the local policy because it contained `Remove-Item`; no source/destination state changed. The rejected removal was the exact non-recursive empty-directory cleanup `Remove-Item -LiteralPath <docs-screenshot-captures descendant> -Force -ErrorAction Stop` followed by `Remove-Item -LiteralPath D:\\Ameow\\docs-screenshot-captures -Force -ErrorAction Stop`; no retry or alternate deletion mechanism will be used.

The source migration itself continues as a collision-checked `Move-Item` operation, which is the approved relocation rather than a deletion workaround. Final per-path digests, byte totals, validation commands, and any retained or blocked paths are recorded below after each operation.

### Completed relocations

- `docs-screenshot-captures/` → `build/docs-screenshot-captures/`: all 18 files moved with per-file SHA-256 verification, totaling 1,990,047 logical bytes after the intentional README correction. The 17 pre-existing image hashes match the preflight manifest exactly; the root no longer exists.
- `mr3-windows-smoke-evidence.json` → `.trellis/tasks/archive/2026-08/08-13-mr3-progress-field/research/evidence/mr3-windows-smoke-evidence.json`: SHA-256 `7679CF27543919B1D8CFAEFEE18233EFDD080B2D27A6C5FF21E70260010559AB` before and after, with a discoverability link added to the archived task report.

#### Preserved image manifest (pre-capture)

| Relative destination | Bytes | SHA-256 |
| --- | ---: | --- |
| `browser-floating-launcher-entry.png` | 6,832 | `2F3133ED7D7FCCA494E55A6B488B387F215DF7CB1739EF2FB8A9125E8C2EB2C1` |
| `desktop-download-active.png` | 111,406 | `B57A4D399EAED8D4C6E0FC44411591F82AB29377D807A3782BB670FE079B0768` |
| `desktop-main-window-expanded.png` | 48,226 | `0150B20328FB444A334B43DFE6AD7224FC7D625E6624425576D9DFBCA46FFD84` |
| `desktop-settings-appearance.png` | 159,531 | `5CCB7008F3A6DF748934C4320898F8229779A93554AFD4524D1B1EFEE48527FE` |
| `desktop-settings-hub.png` | 198,171 | `64587C172468DFF7D0F771F458F69CD292211C69F83BFE2EF12D84F4FB5007C1` |
| `desktop-settings-plugins.png` | 248,249 | `16FB7F1E88DC5A9980367AAE1AAD106CFCC182FE3D56807FF7B4B669B135C087` |
| `desktop-settings-saving.png` | 167,863 | `18241C327B0E0A7B1D1EEA8360134BFC8B97AD8CA24BA63472703F8C3E20BDE8` |
| `desktop-settings-sites.png` | 218,518 | `97EB4A2B65A1F7CC54B414110D9FBC7C55987E1900B977B84641556A99920012` |
| `desktop-settings-system.png` | 239,842 | `49E1983E9BC672CEE958BF45FC575C2B2A5D0C03D78938172F090FB229866236` |
| `desktop-transcode-active.png` | 119,737 | `293B549B8D33E39C780DA720DEE683A6EA7DF6536F262FB9EDDDE3B907DA13E4` |
| `extension-popup-connected.png` | 187,162 | `2CA653A1637CAA259A061085139A2535549BF37F9974C8C3E29EFD5CEC88CDCE` |
| `extension-popup-disconnected.png` | 224,175 | `64FD3A926C69C6CCF1DB16158DF2EAAC97CCD7D1741EBADE452BE9551E85BB9C` |
| `lab/compact-pointer.png` | 10,400 | `9B7EFE9BD590421B4833FABB616F17E0093BEB3DE1659B72D2840060C820EBCD` |
| `lab/download-active.png` | 14,442 | `B2F04D118B43C1FDEDD149FD5D9566B691438746AB71DA16CF3207A99FF7C947` |
| `lab/download-queued.png` | 10,557 | `455F3CBD6FB76C0CB11874A212AEE6DCCF17FA7C513B23988A0F318F3C01C980` |
| `lab/runtime-failed.png` | 9,491 | `D0EA15B9E1E9E6C52740013D301951DC593116425C9D9B6072AB81C76DFC4ACF` |
| `lab/transcode-failed.png` | 13,536 | `B40E7E0F22E92251E80D97570734E0C2DC2F2F82BCE77B555E6E4590B27E7F0A` |

### Approved deletion scopes — preserved after policy block

The `Remove-Item` policy rejection above happened before any deletion. No alternative deletion API, encoded command, or retry was used; all of these paths remain intact for the coordinator/user to remove in an environment that permits the approved operation.

| Status | Exact scope | Logical bytes |
| --- | --- | ---: |
| Blocked | `simple-icons-16.20.0.tgz` | 6,479,178 |
| Blocked | tracked extension ZIP plus its 48 tracked extracted files | 518,192 |
| Blocked | five exact `.trellis/.backup-*` roots | 14,496,667 |
| Blocked | eight named stale portable verification roots | 3,445,979,872 |
| Blocked | `dist-release/win-unpacked.tmp` (retained archive verified separately) | 359,919,916 |
| Retained | empty `.tmp-config/`; current service-test `configDir` still names it | 0 |
| Blocked | 15 design-listed conditional `build/` children after FFF active-task and reparse/process checks | 989,906,126 |
| **Blocked total** | disjoint approved removal candidates | **4,817,299,951** |

Moves are not counted as savings: capture relocation is 1,990,047 logical bytes (including the corrected README) and MR3 relocation is 3,429 bytes.

### Validation

- `node scripts/capture-lab-smoke.mjs --cleanup-self-check` passed its cache path guard, inherited/pre-existing cache preservation, owned-child exit, and failed-spawn checks.
- Direct `node scripts/capture-lab-smoke.mjs` wrote exactly the five required scenarios to `build/docs-screenshot-captures/lab`; direct `node scripts/capture-lab-smoke.mjs --output build/09-11-organize-workspace-artifacts/capture-override` wrote the same five to the explicit task-owned directory. No old root, owned Vite/capture process, or the three run-specific cache children remained; the 12 historical Electron/extension images still match the pre-capture manifest.
- `node --check scripts/capture-lab-smoke.mjs`, `npx vitest run scripts/browser-extension-versioning.test.mjs` (8 passed), `npm run lint`, `npm run type-check`, and `git diff --check` passed. A first `node --test` attempt was invalid because this file uses Vitest's suite API; the correct existing Vitest command passed.
- `node scripts/package-browser-extension.mjs --output-dir build/09-11-organize-workspace-artifacts/browser-extension-package` produced a safe task-owned ZIP; its embedded `browser-extension/manifest.json` is version `0.3.1` and the archive has 82 entries.

### Final safeguards

The metadata-referenced 20260716 portable extraction, current mirror, and ZIP remain present; the ZIP's SHA-256 still matches `portable-verification.json`. The final source hashes are `scripts/capture-lab-smoke.mjs` `CD9E4D1927B0F421C82EB898D2D0EAB71A4C050BF3C6E5B67F1F488F4E2199F4`, `.gitignore` `FB30F2A10C670E26E41131D27C8838FA859FD15910C9C8775B0A2A13C86D9303`, and archived MR3 report `B0E0617598E3E1A2DFEF6F4E5BCAEEC428E033421EE8AA97857EDF231CC721E8`. `scripts/package-portable.ps1` was concurrently modified by its separately assigned owner and was not read, edited, or validated by this worker.
