# Portable app self-update implementation plan

## Preconditions

- Do not start implementation until planning is reviewed and the task is explicitly moved to `in_progress`.
- Before editing code, load `trellis-before-dev` for backend and frontend spec indexes.
- Keep this task scoped to Windows portable self-update; do not rework macOS or installer update behavior.

## Ordered Checklist

1. Update release manifest generation
   - Add portable ZIP discovery to `scripts/generate-updater-manifest.mjs`.
   - Compute SHA256 for the portable ZIP.
   - Emit additive `portable["windows-x86_64"]` metadata without changing `platforms["windows-x86_64"].url`.
   - Add or update script tests if script test coverage exists; otherwise cover with a focused unit/helper test.

2. Add portable package marker
   - Update `scripts/package-portable.ps1` to include an explicit portable marker in the ZIP.
   - Ensure marker exists in `Ameow_portable/` after extraction.
   - Keep marker small and version-neutral enough for future updates.

3. Introduce updater domain helpers
   - Add pure helpers for manifest parsing, portable entry validation, SHA256 validation, install-mode detection, and path safety.
   - Add preflight portable root validation before any portable ZIP download.
   - Add same-volume staging path selection beside the live portable root.
   - Keep helper APIs testable without Electron.

4. Extend Electron update controller
   - Replace pending manifest-only state with pending update state that includes strategy.
   - Installed strategy keeps current download-open-installer behavior.
   - Portable strategy downloads ZIP, verifies checksum, extracts staging, validates structure, launches helper, and quits.
   - Quit only after helper spawn succeeds; helper spawn failure returns to renderer as a retryable error.
   - Add safe manual fallback for unsupported/missing portable metadata.

5. Add external helper launch path
   - Generate or copy helper into temp update directory.
   - Launch with `spawn` using explicit args and detached process settings.
   - Ensure the helper log path is outside the live app directory.
   - Target Windows PowerShell 5.1 syntax.
   - Validate PID/executable identity before waiting.
   - Retry rename operations with bounded backoff.
   - Do not use shell-string command construction for file operations.

6. Update renderer types and copy
   - Additive fields only if needed by UI.
   - Update zh-CN and en locale strings for portable restart/replacement and failure messages.
   - Keep current badge flow unless design review requires a confirmation step.

7. Update specs and docs
   - Update every `.trellis/spec/backend/electron-runtime-contracts.md` statement that says portable builds are manual-only or should not advertise installable updates.
   - Update public docs only if user-facing release/update behavior documentation exists for portable users.

8. Tests and checks
   - Add/update Vitest coverage for update controller and new helpers.
   - Run focused tests first.
   - Run `npm run type-check`.
   - Run `npm run lint`.
   - Run `npm test -- --run` or repository-standard test command if changed tests are broad.

## Risky Files

- `electron/appUpdateController.mts`
- `electron/main.mts`
- `scripts/generate-updater-manifest.mjs`
- `scripts/package-portable.ps1`
- `.github/workflows/release.yml`
- `src/types/appUpdate.ts`
- `src/App.tsx`
- locale JSON files
- `.trellis/spec/backend/electron-runtime-contracts.md`

## Rollback Points

- Manifest change is additive; rollback by removing `portable` metadata generation.
- Runtime strategy selection can be feature-gated to installer-only if helper validation is unstable.
- Portable marker addition is safe to keep even if portable self-update is delayed.
- UI copy/type additions should remain additive and avoid blocking installer updates.

## Review Gates

- Claude review of this planning set before implementation starts.
- Local review after implementation confirms no unsafe recursive delete/move can target paths outside a validated portable root.
- Local review confirms staging extraction happens on the same volume as the live portable root.
- Local review confirms helper spawn failure cannot close the app.
- Manual portable update smoke test should run on a disposable copied portable directory, not the developer's only working package.

## Validation Commands

```powershell
npm run type-check
npm run lint
npm test -- --run electron/appUpdateController.test.mts
```

If new tests are split into separate files, run the specific Vitest files first, then the broader test command.
