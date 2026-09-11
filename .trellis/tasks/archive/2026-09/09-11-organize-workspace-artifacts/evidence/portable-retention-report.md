# Portable verification retention report

## Scope completed

- Updated `scripts/package-portable.ps1` only for latest-successful portable verification retention.
- Added `package-portable-retention-check.ps1`, a framework-free task-local PowerShell check which loads the exact production function bodies from the package script's PowerShell AST. It does not duplicate the retention implementation.
- No real package command ran, and this work did not read, write, remove, or otherwise change `dist-release`.

## Behavior

- A verification extraction now refuses a same-second name collision rather than overwriting or claiming an existing directory. A valid extraction must have the generated `Ameow_portable/.ameow-portable.json` marker.
- Browser-extension packaging completes before verification metadata is changed. Metadata is written to a sibling temporary file and atomically replaced only after that write succeeds; pruning starts only after the new metadata is durable.
- Pruning considers only immediate `Ameow_portable_verify_yyyyMMdd_HHmmss` children under a normal, reparse-free verification root. It protects both the fresh extraction and the metadata path, accepts only marker-bearing Ameow portable candidates, skips reparse/unreadable/unrecognized paths, and never deletes an unexpected directory name.
- Pruning checks `Ameow` processes without terminating anything. It retains a candidate if that process path is unreadable or inside the candidate; recursive removal is preceded by a full reparse scan and a removal failure is warned and returned as a retained path, so successful packaging remains usable without falsely claiming cleanup completed.

## Validation

| Command | Result |
| --- | --- |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File .trellis/tasks/09-11-organize-workspace-artifacts/evidence/package-portable-retention-check.ps1` | Passed |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .trellis/tasks/09-11-organize-workspace-artifacts/evidence/package-portable-retention-check.ps1` | Passed under the command family used by `package:portable` |
| PowerShell AST parse of `scripts/package-portable.ps1` in PowerShell 7 and Windows PowerShell | Passed |
| `npm run type-check` | Passed |
| `npm run lint` | Passed |
| `git diff --check -- scripts/package-portable.ps1` | Passed |

The passing check used the task-owned fixture root `evidence/portable-retention-fixture-d795481bb6fe49d585caccf1b5ec13f0`. It uses a valid ZIP to prune an old marked candidate; retains the fresh metadata path; preserves an unexpected directory and an external-target junction; keeps and reports a locked candidate; confirms invalid expansion and locked metadata persistence retain prior extraction/metadata bytes; and confirms a wrong-parent metadata path skips all pruning.

## Retained boundaries

- No portable process was running during validation. The native check can safely detect an `Ameow` executable path, but cannot prove that arbitrary third-party handles are absent; such a locked removal is retained and reported instead of retried or forcefully resolved.
- A browser-extension package failure occurs before metadata persistence and pruning, leaving the previous metadata/extraction intact. The newly verified but unreferenced extraction is retained rather than deleted speculatively.
- The controlled cleanup attempt for the first test fixture was rejected by policy: `Remove-Item -LiteralPath 'D:\Ameow\.trellis\tasks\09-11-organize-workspace-artifacts\evidence\portable-retention-fixture' -Recurse -Force -ErrorAction Stop`. Its exact rejection was `blocked by policy`; no alternate cleanup method or retry was used. The small task-owned fixtures from loader/debug attempts remain as evidence.
