# Implement phased cleanup for dead code and legacy residue

## Goal

Remove confirmed dead files and clear legacy residue in staged phases, with one commit per completed phase so cleanup history stays recoverable.

## Requirements

- Use the completed `05-23-codebase-cleanup-audit` task as the source audit baseline.
- Keep cleanup phased and reviewable.
- Prefer behavior-preserving cleanup first.
- Commit after each completed phase.
- Do not bundle unrelated changes between phases.
- For ambiguous removals, validate intent from current runtime wiring before deleting.

## Phases

### Phase 1

Low-risk dead files and obvious Tauri residue.

- Remove confirmed unused files:
  - `src/App.css`
  - `src/assets/react.svg`
  - `src/engines/base-engine.ts`
  - `src/components/MaterialGrid.tsx`
  - `src/sites/template.ts`
- Remove obvious non-behavioral Tauri leftovers such as:
  - dead `TAURI_DEV_HOST` config residue in `vite.config.ts`
  - `public/tauri.svg`
- Simplify obviously redundant package scripts when they are no-ops or wrappers only.

### Phase 2

Align living Trellis/spec/documentation with the current Electron runtime.

- Update stale `.trellis/spec/` guidance that still describes Tauri/Rust as the active app runtime.
- Preserve current/accurate docs such as `docs/electron-parity-verification.md`.
- Make retired direct-download onboarding guidance visibly non-authoritative.

### Phase 3

Remove disconnected browser-extension legacy mechanisms.

- Remove the retired picker path if current runtime wiring confirms it is unused end-to-end.
- Remove unregistered detectors and their orphaned companion assets if they are not dynamically loaded anywhere.
- Clean matching message routing/debug residue.

### Phase 4

Stop shipping cleanup residue through build/release tooling.

- Update browser-extension packaging so test files do not ship in release bundles.
- Remove clearly unused workflow matrix fields and similar release residue.

## Acceptance Criteria

- [ ] Each phase lands in its own commit.
- [ ] Phase 1 changes do not alter product behavior.
- [ ] Phase 2 leaves living guidance consistent with the Electron runtime.
- [ ] Phase 3 removes only disconnected extension mechanisms validated as unused.
- [ ] Phase 4 prevents obvious dead/test assets from being packaged into release artifacts.
- [ ] Type-check, lint, and focused tests pass for affected areas before the final wrap-up.

## Notes

- User explicitly asked for per-phase commits so deletions stay auditable and recoverable.
- Current environment cannot run local Trellis Python helpers, so task artifacts are created manually.
